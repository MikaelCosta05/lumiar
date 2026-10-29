import { t } from '../i18n';
import type { ParamType, ShaderPlugin } from './types';

export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
#define PI 3.14159265359
#define FLOW_ZERO (128.0 / 255.0)
`;

/**
 * Desenha a mídia encaixada (contain) na resolução do projeto, vista pela câmera virtual.
 * uCamera = (centro x, centro y [de cima para baixo], zoom, rotação em radianos).
 * O mesmo cálculo existe em project/camera.ts (screenToSource).
 */
export const SOURCE_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform vec2 uScale;
uniform float uRatio;
uniform vec4 uCamera;
uniform float uFill;
uniform float uTurn;    // 0..3 = 0°, 90°, 180°, 270° (horário)
uniform vec2 uFlip;     // espelhar x / y
uniform float uBgMode;  // 0 preto, 1 cor, 2 desfocado
uniform vec3 uBgColor;

/** Ponto da imagem como aparece na tela (0 a 1, y para cima) → coordenada da textura (linha 0 em cima). */
vec2 sourceUv(vec2 p) {
  vec2 d = vec2(p.x, 1.0 - p.y);
  d = mix(d, 1.0 - d, uFlip);
  if (uTurn > 0.5 && uTurn < 1.5) return vec2(d.y, 1.0 - d.x);
  if (uTurn > 1.5 && uTurn < 2.5) return 1.0 - d;
  if (uTurn > 2.5) return vec2(1.0 - d.y, d.x);
  return d;
}

/** Fundo desfocado: a própria mídia cobrindo a tela, borrada e mais escura. */
vec3 blurredBackground() {
  vec2 cover = uScale / min(uScale.x, uScale.y);
  vec2 c = (vUv - 0.5) / cover + 0.5;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float a = float(i) * 0.6981;
    vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * 0.02;
    sum += textureLod(uTexture, sourceUv(clamp(c + o, 0.0, 1.0)), 5.5).rgb;
  }
  return sum / 9.0 * 0.62;
}

void main() {
  float zoom = uCamera.z * mix(1.0, 1.0 / min(uScale.x, uScale.y), uFill);
  vec2 s = (vUv - 0.5) * vec2(uRatio, 1.0);
  float c = cos(uCamera.w);
  float sn = sin(uCamera.w);
  s = vec2(c * s.x - sn * s.y, sn * s.x + c * s.y) / zoom;
  // A vista não sai da imagem (evita bordas pretas ao seguir ou dar zoom).
  vec2 h = 0.5 / (zoom * uScale);
  vec2 center = clamp(vec2(uCamera.x, 1.0 - uCamera.y), min(h, vec2(0.5)), max(1.0 - h, vec2(0.5)));
  vec2 p = s / vec2(uRatio, 1.0) / uScale + center;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
    vec3 bg = uBgMode > 1.5 ? blurredBackground() : uBgMode > 0.5 ? uBgColor : vec3(0.0);
    outColor = vec4(bg, 1.0);
    return;
  }
  outColor = vec4(texture(uTexture, sourceUv(p)).rgb, 1.0);
}`;

/** Câmera lenta simples: mistura os dois quadros vizinhos. */
export const BLEND_FRAGMENT = `${HEADER}
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform float uAlpha;
void main() {
  outColor = mix(texture(uPrev, vUv), texture(uNext, vUv), uAlpha);
}`;

/**
 * Fluxo de movimento (imagem reduzida): para cada pixel, procura o deslocamento d
 * que faz o quadro anterior (em -d/2) e o seguinte (em +d/2) ficarem mais parecidos.
 * Guarda d em pixels reduzidos, codificado de 0 a 1 (±16 px).
 */
export const FLOW_FRAGMENT = `${HEADER}
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform vec2 uTexel;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float patchCost(vec2 uv, vec2 d, float spacing, float lod) {
  float s = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j)) * uTexel * spacing;
      float a = lum(textureLod(uPrev, uv + o - d * uTexel * 0.5, lod).rgb);
      float b = lum(textureLod(uNext, uv + o + d * uTexel * 0.5, lod).rgb);
      s += abs(a - b);
    }
  }
  return s;
}

void main() {
  // 1) Busca grossa nas imagens borradas (mipmap): errar por pouco custa pouco,
  //    então o movimento certo não "escapa" entre os passos da grade.
  //    Movimentos grandes custam um pouco mais: em áreas lisas várias explicações batem,
  //    e a menor (a mais provável) deve ganhar em vez de um salto falso.
  vec2 best = vec2(0.0);
  float bestCost = patchCost(vUv, best, 3.0, 1.5);
  for (int y = -6; y <= 6; y++) {
    for (int x = -6; x <= 6; x++) {
      vec2 d = vec2(float(x), float(y)) * 2.0;
      float c = patchCost(vUv, d, 3.0, 1.5) + length(d) * 0.02;
      if (c < bestCost) { bestCost = c; best = d; }
    }
  }
  // 2) Refinamento de 1 px na imagem nítida, com pedaços em duas escalas.
  vec2 coarse = best;
  bestCost = 1e9;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 d = coarse + vec2(float(x), float(y));
      float c = patchCost(vUv, d, 1.5, 0.0) + patchCost(vUv, d, 3.0, 0.0) * 0.5 + length(d) * 0.02;
      if (c < bestCost) { bestCost = c; best = d; }
    }
  }
  // O zero fica em 128/255, que a textura de 8 bits guarda exato (0,5 viraria um leve deslocamento).
  outColor = vec4(best / 32.0 + FLOW_ZERO, 0.0, 1.0);
}`;

/** Quadro intermediário: empurra cada quadro pela fração certa do movimento e mistura. */
export const WARP_FRAGMENT = `${HEADER}
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform sampler2D uFlow;
uniform float uAlpha;
uniform vec2 uTexel;
void main() {
  // Média 3×3 do fluxo: menos "rasgos" nas bordas dos objetos.
  vec2 f = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      f += texture(uFlow, vUv + vec2(float(i), float(j)) * uTexel).xy;
    }
  }
  vec2 d = (f / 9.0 - FLOW_ZERO) * 32.0 * uTexel;
  vec4 a = texture(uPrev, vUv - d * uAlpha);
  vec4 b = texture(uNext, vUv + d * (1.0 - uAlpha));
  outColor = mix(a, b, uAlpha);
}`;

export const COPY_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
void main() {
  outColor = texture(uTexture, vUv);
}`;

/**
 * Camada sobreposta: a imagem já processada (esticada no quadro todo) é colocada num
 * retângulo girado, com cantos arredondados, chroma key e opacidade. Sai com alfa pré-multiplicado.
 */
export const PLACE_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform vec2 uCenter;   // centro na tela (0 a 1, y para baixo)
uniform vec2 uSize;     // tamanho na tela (fração da largura e da altura)
uniform float uAngle;   // radianos
uniform float uRatio;   // largura / altura da saída
uniform float uOpacity;
uniform float uRadius;  // fração do lado menor
uniform vec3 uKey;      // cor do chroma key
uniform vec2 uKeyParams; // (semelhança, suavidade); semelhança < 0 = desligado
uniform vec2 uPixel;    // tamanho de 1 pixel da saída
uniform float uUseAlpha; // 1 = a camada tem transparência própria (fundo removido)
uniform float uMaskShape; // 0 nenhuma, 1 elipse, 2 retângulo, 3 coração, 4 estrela, 5 losango
uniform vec4 uMaskRect;   // centro (x, y) e tamanho (w, h) dentro da camada, 0 a 1
uniform vec2 uMaskSoft;   // (suavidade da borda, inverter)
uniform vec2 uMaskPath[32]; // forma desenhada à mão (pontos dentro da camada, y para baixo)
uniform int uMaskCount;

/** Distância até o contorno do polígono desenhado (negativa dentro). */
float pathDistance(vec2 p) {
  float d = dot(p - uMaskPath[0], p - uMaskPath[0]);
  float s = 1.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uMaskCount) break;
    int j = i == 0 ? uMaskCount - 1 : i - 1;
    vec2 vi = uMaskPath[i];
    vec2 vj = uMaskPath[j];
    vec2 e = vj - vi;
    vec2 w = p - vi;
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}

/** Distância até a borda da forma (negativa dentro), em unidades da forma (-1 a 1). */
float maskDistance(vec2 q) {
  if (uMaskShape < 1.5) return length(q) - 1.0;
  if (uMaskShape < 2.5) return max(abs(q.x), abs(q.y)) - 1.0;
  if (uMaskShape < 3.5) {
    // Coração (curva implícita clássica), com a ponta para baixo.
    vec2 h = vec2(q.x, -q.y * 1.1 + 0.25) * 1.25;
    float a = h.x * h.x + h.y * h.y - 1.0;
    return (a * a * a - h.x * h.x * h.y * h.y * h.y) * 0.8;
  }
  if (uMaskShape < 4.5) {
    // Estrela de 5 pontas.
    float ang = atan(q.x, q.y);
    float r = length(q);
    float k = cos(floor(0.5 + ang / 1.2566) * 1.2566 - ang);
    return r * k - mix(0.45, 1.0, pow(abs(cos(ang * 2.5)), 6.0));
  }
  return abs(q.x) + abs(q.y) - 1.0;
}

vec2 toChroma(vec3 c) {
  return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081)));
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  vec2 d = (p - uCenter) * vec2(uRatio, 1.0);
  float c = cos(-uAngle);
  float s = sin(-uAngle);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  vec2 half_ = 0.5 * uSize * vec2(uRatio, 1.0);
  // Distância até a borda do retângulo arredondado (negativa dentro).
  float r = uRadius * min(half_.x, half_.y) * 2.0;
  vec2 q = abs(d) - half_ + r;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float aa = 1.0 - smoothstep(-uPixel.y, uPixel.y, dist);
  if (aa <= 0.0) discard;

  vec2 local = d / (2.0 * half_) + 0.5;
  vec4 tex = texture(uTexture, vec2(local.x, 1.0 - local.y));
  vec3 col = tex.rgb;
  float alpha = aa * uOpacity * mix(1.0, tex.a, uUseAlpha);
  if (uMaskShape > 5.5) {
    // Forma desenhada: a borda suave é medida em fração da camada.
    float soft = max(uMaskSoft.x * 0.2, 0.002);
    float inside = 1.0 - smoothstep(-soft, soft, pathDistance(local));
    alpha *= mix(inside, 1.0 - inside, uMaskSoft.y);
  } else if (uMaskShape > 0.5) {
    vec2 q = (local - uMaskRect.xy) / max(uMaskRect.zw * 0.5, vec2(0.001));
    float soft = max(uMaskSoft.x, 0.004);
    float inside = 1.0 - smoothstep(-soft, soft, maskDistance(q));
    alpha *= mix(inside, 1.0 - inside, uMaskSoft.y);
  }
  if (alpha <= 0.0) discard;
  if (uKeyParams.x >= 0.0) {
    float diff = distance(toChroma(col), toChroma(uKey));
    float edge = uKeyParams.x * 0.4;
    alpha *= smoothstep(edge, edge + 0.002 + uKeyParams.y * 0.25, diff);
    // Tira o reflexo da cor do fundo nas bordas (spill).
    float spill = 1.0 - smoothstep(edge, edge + 0.15, diff);
    col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), spill * 0.6);
  }
  outColor = vec4(col * alpha, alpha);
}`;

/**
 * Fundo removido: uMatte (já passado pela mesma câmera da mídia) diz onde está a pessoa.
 * Modo 1 = recorta (transparente), 2 = desfoca o fundo, 3 = troca o fundo por uma cor.
 */
export const MATTE_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform sampler2D uMatte;
uniform float uMode;
uniform vec3 uColor;
uniform vec2 uPixel;
void main() {
  vec3 col = texture(uTexture, vUv).rgb;
  float m = smoothstep(0.35, 0.65, texture(uMatte, vUv).r);
  if (uMode < 1.5) {
    outColor = vec4(col, m);
    return;
  }
  vec3 bg = uColor;
  if (uMode < 2.5) {
    // Desfoque em dois anéis (sem mipmap nos alvos de desenho).
    vec3 sum = col;
    float n = 1.0;
    for (int ring = 1; ring <= 3; ring++) {
      for (int i = 0; i < 10; i++) {
        float a = float(i) * 0.6283 + float(ring) * 0.3;
        vec2 o = vec2(cos(a), sin(a)) * uPixel * float(ring) * 9.0;
        sum += texture(uTexture, vUv + o).rgb;
        n += 1.0;
      }
    }
    bg = sum / n;
  }
  outColor = vec4(mix(bg, col, m), 1.0);
}`;

/**
 * Correção de cor manual e LUT, depois do filtro:
 * lift/gamma/gain (sombras, meios-tons, altas luzes), saturação, curvas e a LUT 3D (.cube).
 */
export const COLOR_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform sampler2D uCurves;   // 256×1: r, g, b = curva de cada canal; a = curva geral
uniform highp sampler3D uLut;
uniform float uUseGrade;
uniform float uUseCurves;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uLutSize;      // 0 = sem LUT
uniform float uLutAmount;
float curve(float v, int channel) {
  vec4 c = texture(uCurves, vec2(clamp(v, 0.0, 1.0) * 255.0 / 256.0 + 0.5 / 256.0, 0.5));
  return channel == 0 ? c.r : channel == 1 ? c.g : channel == 2 ? c.b : c.a;
}
void main() {
  vec4 src = texture(uTexture, vUv);
  vec3 c = src.rgb;
  if (uUseGrade > 0.5) {
    c = c * uGain + uLift * (1.0 - c);
    c = pow(max(c, 0.0), 1.0 / max(uGamma, vec3(0.05)));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSaturation);
  }
  if (uUseCurves > 0.5) {
    c = vec3(curve(c.r, 0), curve(c.g, 1), curve(c.b, 2));
    c = vec3(curve(c.r, 3), curve(c.g, 3), curve(c.b, 3));
  }
  if (uLutSize > 0.5) {
    vec3 p = clamp(c, 0.0, 1.0) * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize;
    c = mix(c, texture(uLut, p).rgb, uLutAmount);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

/**
 * Imagem de canvas (linha 0 em cima) já com alfa pré-multiplicado.
 * Com uUseMask, some onde a máscara é branca (texto atrás da pessoa).
 */
export const OVERLAY_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uUseMask;
void main() {
  vec4 c = texture(uTexture, vec2(vUv.x, 1.0 - vUv.y));
  if (uUseMask > 0.5) c *= 1.0 - smoothstep(0.3, 0.7, texture(uMask, vUv).r);
  outColor = c;
}`;

/** Quadro guardado no histórico (menor): a cor e, no alfa, onde está a pessoa. */
export const HISTORY_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform sampler2D uPerson;
uniform float uHasPerson;
void main() {
  float p = uHasPerson > 0.5 ? smoothstep(0.3, 0.7, texture(uPerson, vUv).r) : 1.0;
  outColor = vec4(texture(uTexture, vUv).rgb, p);
}`;

/**
 * Fundo sem a pessoa: onde ela não está, vale o quadro atual; onde está, o que foi visto antes
 * naquele lugar. No primeiro quadro (ou onde nunca se viu), preenche com as cores em volta dela.
 */
export const PLATE_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
uniform sampler2D uPrevious;
uniform sampler2D uPerson;
uniform float uFresh;
uniform vec2 uPixel;
float covered(vec2 uv) {
  // A borda da máscara é um pouco maior que a pessoa (cabelo, sombra): olha em volta.
  float m = texture(uPerson, uv).r;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    m = max(m, texture(uPerson, uv + vec2(cos(a), sin(a)) * uPixel * 10.0).r);
  }
  return smoothstep(0.15, 0.4, m);
}
void main() {
  vec3 cur = texture(uTexture, vUv).rgb;
  float m = covered(vUv);
  if (m < 0.01) { outColor = vec4(cur, 1.0); return; }
  vec3 fill;
  if (uFresh > 0.5) {
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.3927;
      vec2 dir = vec2(cos(a), sin(a)) * uPixel;
      float dist = 8.0;
      for (int k = 0; k < 24; k++) {
        vec2 p = vUv + dir * dist;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
        if (covered(p) < 0.1) {
          float w = 1.0 / (dist * dist);
          sum += texture(uTexture, p).rgb * w;
          total += w;
          break;
        }
        dist *= 1.3;
      }
    }
    fill = total > 0.0 ? sum / total : cur;
  } else {
    fill = texture(uPrevious, vUv).rgb;
  }
  outColor = vec4(mix(cur, fill, m), 1.0);
}`;

/** O que todo efeito recebe pronto. O plugin escreve: vec4 effect(vec2 uv) */
const EFFECT_PRELUDE = `
uniform sampler2D uInput;
uniform float time;      // segundos desde o início do clipe
uniform float duration;  // duração do clipe em segundos
uniform float ratio;     // largura / altura
uniform vec2 resolution; // tamanho do quadro em pixels
vec4 getColor(vec2 uv) { return texture(uInput, uv); }
// Entradas extras: o motor só calcula as que o código do plugin chama.
uniform sampler2D uPerson;
uniform sampler2D uDepth;
uniform sampler2D uState;
uniform sampler2D uMotion;
uniform sampler2D uBackground;
uniform highp sampler2DArray uHistory;
uniform float uHasPerson;
uniform float uHasDepth;
uniform float uFresh;
uniform vec3 uHistoryInfo; // (próxima posição, quadros guardados, quadros por segundo)
uniform vec2 uMotionScale;
/** Onde está a pessoa (1) e onde não está (0). */
float getPerson(vec2 uv) { return uHasPerson > 0.5 ? smoothstep(0.3, 0.7, texture(uPerson, uv).r) : 0.0; }
/** Profundidade: 1 = perto, 0 = longe (enquanto a IA calcula, uma estimativa: chão perto, céu longe). */
float getDepth(vec2 uv) {
  if (uHasDepth > 0.5) return texture(uDepth, uv).r;
  return max(clamp(1.0 - uv.y * 1.3, 0.0, 1.0) * 0.8, getPerson(uv));
}
/** O que state() devolveu no quadro anterior. */
vec4 getPrevious(vec2 uv) { return texture(uState, uv); }
/** Primeiro quadro (começo do clipe ou depois de pular no tempo): ainda não há passado. */
bool firstFrame() { return uFresh > 0.5; }
/** Quanto a imagem andou desde o quadro anterior neste ponto (em uv). */
vec2 getMotion(vec2 uv) { return (texture(uMotion, uv).xy - FLOW_ZERO) * uMotionScale; }
/** Quadro de alguns segundos atrás (até ~1 s). No alfa: onde a pessoa estava. */
vec4 getPast(vec2 uv, float seconds) {
  if (uHistoryInfo.y < 0.5) return vec4(getColor(uv).rgb, uHasPerson > 0.5 ? getPerson(uv) : 1.0);
  float n = clamp(floor(seconds * uHistoryInfo.z + 0.5), 1.0, uHistoryInfo.y);
  return texture(uHistory, vec3(uv, mod(uHistoryInfo.x - n + 64.0, 32.0)));
}
/** O fundo sem a pessoa (o que estava atrás dela). */
vec4 getBackground(vec2 uv) { return texture(uBackground, uv); }
`;

/**
 * Filtro de cor. O plugin escreve: vec4 applyFilter(vec4 color, vec2 uv)
 * e o resultado é misturado com o original pela intensidade.
 */
const FILTER_PRELUDE = `${EFFECT_PRELUDE}
uniform float intensity; // 0 → 1
`;

/** Mesmo formato do gl-transitions. O plugin escreve: vec4 transition(vec2 uv) */
const TRANSITION_PRELUDE = `
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float progress;  // 0 → 1
uniform float ratio;
uniform vec2 resolution;
vec4 getFromColor(vec2 uv) { return texture(uFrom, uv); }
vec4 getToColor(vec2 uv) { return texture(uTo, uv); }
uniform sampler2D uFromPerson;
uniform sampler2D uToPerson;
uniform sampler2D uState;
uniform sampler2D uMotion;
uniform vec2 uHasPerson;  // (no clipe atual, no próximo)
uniform float uFresh;
uniform vec2 uMotionScale;
/** Onde está a pessoa no clipe atual / no próximo. */
float getFromPerson(vec2 uv) { return uHasPerson.x > 0.5 ? smoothstep(0.3, 0.7, texture(uFromPerson, uv).r) : 0.0; }
float getToPerson(vec2 uv) { return uHasPerson.y > 0.5 ? smoothstep(0.3, 0.7, texture(uToPerson, uv).r) : 0.0; }
vec4 getPrevious(vec2 uv) { return texture(uState, uv); }
bool firstFrame() { return uFresh > 0.5; }
/** Movimento do próximo clipe desde o quadro anterior (em uv). */
vec2 getMotion(vec2 uv) { return (texture(uMotion, uv).xy - FLOW_ZERO) * uMotionScale; }
`;

const GLSL_TYPE: Record<ParamType, string> = { float: 'float', vec2: 'vec2', color: 'vec3' };

export interface PluginSource {
  source: string;
  /** Linhas adicionadas antes do código do plugin (para corrigir números de linha nos erros). */
  lineOffset: number;
}

const PRELUDES = { effect: EFFECT_PRELUDE, filter: FILTER_PRELUDE, transition: TRANSITION_PRELUDE };

const MAINS = {
  effect: 'void main() { outColor = effect(vUv); }',
  filter: `void main() {
  vec4 original = getColor(vUv);
  outColor = mix(original, applyFilter(original, vUv), clamp(intensity, 0.0, 1.0));
}`,
  transition: 'void main() { outColor = transition(vUv); }',
};

/**
 * Entradas extras que o plugin usa, descobertas pelo próprio código (basta chamar a função):
 * getPerson / getFromPerson / getToPerson, getDepth, getPast, getMotion, getBackground e
 * um `vec4 state(vec2 uv)`, que guarda uma imagem de um quadro para o outro (lida com getPrevious).
 */
export interface PluginInputs {
  person: boolean;
  depth: boolean;
  history: boolean;
  state: boolean;
  motion: boolean;
  background: boolean;
}

const inputsCache = new Map<string, PluginInputs>();

export function pluginInputs(plugin: Pick<ShaderPlugin, 'glsl'>): PluginInputs {
  let found = inputsCache.get(plugin.glsl);
  if (!found) {
    const g = plugin.glsl.replace(/\/\/.*$/gm, '');
    const background = /\bgetBackground\s*\(/.test(g);
    found = {
      person: background || /\bget(From|To)?Person\s*\(/.test(g),
      depth: /\bgetDepth\s*\(/.test(g),
      history: /\bgetPast\s*\(/.test(g),
      state: /\bvec4\s+state\s*\(/.test(g),
      motion: /\bgetMotion\s*\(/.test(g),
      background,
    };
    inputsCache.set(plugin.glsl, found);
  }
  return found;
}

/** `pass` = 'state' monta o shader que calcula o estado guardado para o próximo quadro. */
export function buildPluginSource(plugin: ShaderPlugin, pass: 'main' | 'state' = 'main'): PluginSource {
  const uniforms = plugin.params.map((p) => `uniform ${GLSL_TYPE[p.type]} ${p.id};`).join('\n');
  const head = `${HEADER}${PRELUDES[plugin.kind]}${uniforms}\n`;
  const main = pass === 'state' ? 'void main() { outColor = state(vUv); }' : MAINS[plugin.kind];
  return {
    source: `${head}${plugin.glsl}\n${main}`,
    lineOffset: head.split('\n').length - 1,
  };
}

/** Converte "ERROR: 0:52: ..." para a linha correspondente dentro do shader.glsl do plugin. */
export function formatShaderLog(log: string, lineOffset: number): string {
  return log
    .replace(/ERROR: 0:(\d+):/g, (_, line: string) => t('linha {n}:', { n: Number(line) - lineOffset }))
    .trim();
}
