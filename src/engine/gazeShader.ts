import { registerBuiltinPlugin } from './registry';
import type { ParamDef, ShaderPlugin } from './types';

/**
 * Olhar para a câmera (efeito interno: os olhos de cada instante vêm do clipe, em project/gaze.ts).
 *
 * Trabalha no espaço da mídia (desfaz a câmera e o encaixe, como o shader de origem), com x e y na
 * mesma escala. Só dentro da abertura de cada olho (duas parábolas entre os cantos): a íris é levada
 * inteira até o alvo e o lugar onde ela estava vira parte branca. As pálpebras e a pele não mexem.
 * (Uma deformação simples não serve: a abertura é mais baixa que a íris, e esticar o branco que não
 * existe acima ou abaixo dela vira listras.)
 */
const GLSL = `
#define DEAD_ZONE 0.03

vec2 fitScale() {
  if (encaixe < 0.5) return vec2(1.0);
  return aspecto > ratio ? vec2(1.0, ratio / aspecto) : vec2(aspecto / ratio, 1.0);
}

float viewZoom(vec2 sc) {
  return camZoom * mix(1.0, 1.0 / min(sc.x, sc.y), camEncher);
}

vec2 viewCenter(vec2 sc, float zoom) {
  vec2 h = 0.5 / (zoom * sc);
  return clamp(vec2(camCentro.x, 1.0 - camCentro.y), min(h, vec2(0.5)), max(1.0 - h, vec2(0.5)));
}

/** Tela → mídia (y para cima). O mesmo cálculo de engine/shaders.ts. */
vec2 toMedia(vec2 uv) {
  vec2 sc = fitScale();
  float zoom = viewZoom(sc);
  vec2 s = (uv - 0.5) * vec2(ratio, 1.0);
  float c = cos(camGiro);
  float sn = sin(camGiro);
  s = vec2(c * s.x - sn * s.y, sn * s.x + c * s.y) / zoom;
  return s / vec2(ratio, 1.0) / sc + viewCenter(sc, zoom);
}

/** Mídia → tela. */
vec2 toScreen(vec2 p) {
  vec2 sc = fitScale();
  float zoom = viewZoom(sc);
  vec2 s = (p - viewCenter(sc, zoom)) * sc * vec2(ratio, 1.0) * zoom;
  float c = cos(camGiro);
  float sn = sin(camGiro);
  s = vec2(c * s.x + sn * s.y, -sn * s.x + c * s.y);
  return s / vec2(ratio, 1.0) + 0.5;
}

vec3 colorAt(vec2 P) {
  return getColor(toScreen(P / vec2(aspecto, 1.0))).rgb;
}

/** Olho no espaço dele: centro, eixo (u, de dentro para fora), v para a pálpebra de cima e as alturas. */
struct Eye {
  vec2 C;
  vec2 u;
  vec2 v;
  float halfLen;
  float hu;
  float hl;
};

bool insideEye(Eye e, vec2 q, float margin) {
  float x = q.x / e.halfLen;
  float k = 1.0 - x * x;
  return abs(x) < 1.0 && q.y < e.hu * k - margin && q.y > -e.hl * k + margin;
}

/** Distância até a borda do olho (na vertical, corrigida pela inclinação da pálpebra); negativa fora. */
float edgeDistance(Eye e, vec2 q) {
  float x = q.x / e.halfLen;
  if (abs(x) >= 1.0) return -1.0;
  float k = 1.0 - x * x;
  float su = 2.0 * e.hu * abs(x) / e.halfLen;
  float sl = 2.0 * e.hl * abs(x) / e.halfLen;
  return min((e.hu * k - q.y) / sqrt(1.0 + su * su), (q.y + e.hl * k) / sqrt(1.0 + sl * sl));
}

vec2 toWorld(Eye e, vec2 q) {
  return e.C + e.u * q.x + e.v * q.y;
}

/**
 * Cor nova do olho no ponto P (unidades da mídia, x vezes o aspecto). alpha = quanto vale (0 fora do olho).
 * A íris (um disco) é recortada do lugar dela e colada no alvo; onde ela estava, vira parte branca,
 * copiada do branco ao lado da íris na mesma altura. A parte da íris que estava escondida pela pálpebra
 * é completada com o mesmo anel da íris, num ponto visível.
 */
vec3 eyeColor(vec2 P, vec2 A, vec2 B, vec2 U, vec2 L, vec2 I, vec2 T, vec2 extra, out float alpha) {
  alpha = 0.0;
  float weight = extra.y * forca;
  if (weight <= 0.001) return vec3(0.0);
  vec2 axis = B - A;
  float len = length(axis);
  if (len < 1e-5) return vec3(0.0);
  Eye e;
  e.u = axis / len;
  e.v = vec2(-e.u.y, e.u.x);
  e.C = (A + B) * 0.5;
  if (dot(U - e.C, e.v) < dot(L - e.C, e.v)) e.v = -e.v;
  e.halfLen = len * 0.5;
  e.hu = max(dot(U - e.C, e.v), 1e-5);
  e.hl = max(-dot(L - e.C, e.v), 1e-5);
  vec2 q = vec2(dot(P - e.C, e.u), dot(P - e.C, e.v));
  if (!insideEye(e, q, 0.0)) return vec3(0.0);

  vec2 d = T - I;
  vec2 shift = vec2(dot(d, e.u), dot(d, e.v) * vertical);
  // Perto do alvo já parece olhar para a lente (e o alvo varia de pessoa para pessoa): só corrige o
  // que passa dessa folga.
  float m = length(shift);
  float slack = DEAD_ZONE * len;
  if (m <= slack) return vec3(0.0);
  shift *= (m - slack) / m * weight;
  float r = extra.x * len;
  m = length(shift);
  // Mais que o raio da íris já não parece um olho de verdade.
  if (m > r) shift *= r / m;
  if (m < 1e-4 * len) return vec3(0.0);

  // A borda do olho não mexe.
  alpha = smoothstep(0.0, 0.05 * len, edgeDistance(e, q));

  vec2 iq = vec2(dot(I - e.C, e.u), dot(I - e.C, e.v));
  float disc = r * 1.1;
  float soft = max(0.08 * r, 0.006 * len);

  // Fundo: o olho sem a íris. Onde ela estava, o branco da mesma altura logo ao lado dela (dos dois
  // lados, misturando pela posição); perto da pálpebra, a altura é puxada para dentro do olho.
  vec3 original = colorAt(P);
  vec3 back = original;
  float dy = q.y - iq.y;
  float inOld = 1.0 - smoothstep(disc, disc + soft * 2.0, distance(q, iq));
  if (inOld > 0.0) {
    float reach = sqrt(max(0.0, (disc + soft * 3.0) * (disc + soft * 3.0) - dy * dy)) + soft;
    vec3 sides[2];
    for (int side = 0; side < 2; side++) {
      float sx = iq.x + (side == 0 ? -reach : reach);
      sx = clamp(sx, -e.halfLen * 0.92, e.halfLen * 0.92);
      float xx = sx / e.halfLen;
      float kk = 1.0 - xx * xx;
      float sy = clamp(q.y, -e.hl * kk * 0.7, e.hu * kk * 0.7);
      sides[side] = colorAt(toWorld(e, vec2(sx, sy)));
    }
    float t = smoothstep(-disc, disc, q.x - iq.x);
    back = mix(original, mix(sides[0], sides[1], t), inOld);
  }

  // A íris no lugar novo. O pedaço que estava escondido pela pálpebra vem do mesmo anel da íris,
  // girando em direção à linha do meio até achar uma parte visível (a íris é quase igual em volta).
  vec2 from = q - shift - iq;
  float rho = length(from);
  float cover = 1.0 - smoothstep(disc, disc + soft * 2.0, rho);
  vec3 color = back;
  if (cover > 0.0) {
    // Perto da pálpebra, a cor de verdade vai dando lugar ao preenchimento (sem emenda).
    float visible = smoothstep(0.02 * len, 0.08 * len, edgeDistance(e, q - shift));
    vec3 irisColor = visible > 0.0 ? colorAt(toWorld(e, q - shift)) : vec3(0.0);
    if (visible < 1.0) {
      // Um pouco para dentro do anel (a borda estimada da íris nunca é exata) e dos dois lados,
      // misturados perto da vertical, para não aparecer emenda.
      float ring = min(rho, r * 0.85);
      float angle = abs(atan(from.y, abs(from.x)));
      float up = sign(from.y + 1e-6);
      vec3 both[2];
      for (int side = 0; side < 2; side++) {
        float sx = side == 0 ? -1.0 : 1.0;
        float lo = 0.0;
        float hi = angle;
        for (int i = 0; i < 7; i++) {
          float mid = (lo + hi) * 0.5;
          if (edgeDistance(e, iq + ring * vec2(sx * cos(mid), up * sin(mid))) > 0.08 * len) lo = mid;
          else hi = mid;
        }
        both[side] = colorAt(toWorld(e, iq + ring * vec2(sx * cos(lo), up * sin(lo))));
      }
      irisColor = mix(mix(both[0], both[1], smoothstep(-0.5, 0.5, from.x / max(rho, 1e-5))), irisColor, visible);
    }
    color = mix(back, irisColor, cover);
  }
  return color;
}

vec4 effect(vec2 uv) {
  vec2 asp = vec2(aspecto, 1.0);
  vec2 P = toMedia(uv) * asp;
  float alpha;
  vec3 c = eyeColor(P, olho0a * asp, olho0b * asp, olho0c * asp, olho0d * asp, iris0 * asp, alvo0 * asp, extra0, alpha);
  if (alpha <= 0.0) c = eyeColor(P, olho1a * asp, olho1b * asp, olho1c * asp, olho1d * asp, iris1 * asp, alvo1 * asp, extra1, alpha);
  vec4 original = getColor(uv);
  if (alpha <= 0.0) return original;
  return vec4(mix(original.rgb, c, alpha), original.a);
}
`;

const float = (id: string, value: number): ParamDef => ({ id, label: id, type: 'float', default: value });
const vec2 = (id: string): ParamDef => ({ id, label: id, type: 'vec2', default: [0, 0] });

export const GAZE_PLUGIN: ShaderPlugin = {
  id: 'builtin/olhar-para-camera',
  kind: 'effect',
  name: 'Olhar para a câmera',
  description: '',
  category: 'Correção',
  params: [
    float('forca', 0.8),
    float('vertical', 1),
    float('aspecto', 16 / 9),
    float('encaixe', 1),
    vec2('camCentro'),
    float('camZoom', 1),
    float('camGiro', 0),
    float('camEncher', 0),
    ...[0, 1].flatMap((e) => ['a', 'b', 'c', 'd'].map((k) => vec2(`olho${e}${k}`)).concat([vec2(`iris${e}`), vec2(`alvo${e}`), vec2(`extra${e}`)])),
  ],
  previewParams: {},
  glsl: GLSL,
};

registerBuiltinPlugin(GAZE_PLUGIN);
