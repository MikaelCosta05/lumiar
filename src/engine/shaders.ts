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
  outColor = vec4(best / 32.0 + 0.5, 0.0, 1.0);
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
  vec2 d = (f / 9.0 - 0.5) * 32.0 * uTexel;
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
  vec3 col = texture(uTexture, vec2(local.x, 1.0 - local.y)).rgb;
  float alpha = aa * uOpacity;
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

/** Imagem de canvas (linha 0 em cima) já com alfa pré-multiplicado. */
export const OVERLAY_FRAGMENT = `${HEADER}
uniform sampler2D uTexture;
void main() {
  outColor = texture(uTexture, vec2(vUv.x, 1.0 - vUv.y));
}`;

/** O que todo efeito recebe pronto. O plugin escreve: vec4 effect(vec2 uv) */
const EFFECT_PRELUDE = `
uniform sampler2D uInput;
uniform float time;      // segundos desde o início do clipe
uniform float duration;  // duração do clipe em segundos
uniform float ratio;     // largura / altura
uniform vec2 resolution; // tamanho do quadro em pixels
vec4 getColor(vec2 uv) { return texture(uInput, uv); }
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

export function buildPluginSource(plugin: ShaderPlugin): PluginSource {
  const uniforms = plugin.params.map((p) => `uniform ${GLSL_TYPE[p.type]} ${p.id};`).join('\n');
  const head = `${HEADER}${PRELUDES[plugin.kind]}${uniforms}\n`;
  const main = MAINS[plugin.kind];
  return {
    source: `${head}${plugin.glsl}\n${main}`,
    lineOffset: head.split('\n').length - 1,
  };
}

/** Converte "ERROR: 0:52: ..." para a linha correspondente dentro do shader.glsl do plugin. */
export function formatShaderLog(log: string, lineOffset: number): string {
  return log
    .replace(/ERROR: 0:(\d+):/g, (_, line: string) => `linha ${Number(line) - lineOffset}:`)
    .trim();
}
