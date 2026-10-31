/**
 * Biblioteca de GLSL que todo filtro, efeito e transição recebe pronta (prefixo `lm`, para não chocar com nomes
 * dos plugins). O compilador descarta o que o plugin não usa, então incluir tudo não custa nada no quadro.
 *
 * O que ela resolve, que os plugins faziam cada um do seu jeito (e com cara de amador):
 * - acaso sem `fract(sin(...))`: aquele truque dá padrões visíveis (listras, quadriculado) e muda de placa para placa;
 * - ruído suave (gradiente, 2D e 3D, com oitavas) para nuvens, fumaça, tremores e texturas orgânicas;
 * - cor medida direito: luminância Rec.709, conversão sRGB ↔ linear exata, Oklab (cor perceptual), HSV;
 * - modos de mistura com as fórmulas oficiais (W3C/Photoshop): screen, overlay, luz suave, subexpor cor…;
 * - bordas sem serrilhado (`lmFill` com a derivada do pixel) e formas por distância (círculo, caixa, segmento);
 * - curvas de animação (easing) de editor profissional e uma mola amortecida;
 * - tamanhos que não dependem da resolução: `lmPx(n)` = n pixels de um vídeo 1080p, em qualquer resolução.
 */

export const GLSL_LIB = `
// ---------------------------------------------------------------- Acaso (PCG, Jarzynski e Olano 2020)
uint lmPcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
uvec3 lmPcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
const float LM_U2F = 1.0 / 4294967295.0;
/** Número entre 0 e 1 para cada valor (qualquer float: o mesmo valor dá sempre o mesmo número). */
float lmHash(float p) { return float(lmPcg(floatBitsToUint(p))) * LM_U2F; }
float lmHash(vec2 p) { return float(lmPcg3(uvec3(floatBitsToUint(p), 0x9e3779b9u)).x) * LM_U2F; }
float lmHash(vec3 p) { return float(lmPcg3(floatBitsToUint(p)).x) * LM_U2F; }
vec2 lmHash2(vec2 p) { return vec2(lmPcg3(uvec3(floatBitsToUint(p), 0x9e3779b9u)).xy) * LM_U2F; }
vec3 lmHash3(vec2 p) { return vec3(lmPcg3(uvec3(floatBitsToUint(p), 0x9e3779b9u))) * LM_U2F; }
vec3 lmHash3(vec3 p) { return vec3(lmPcg3(floatBitsToUint(p))) * LM_U2F; }
/** Acaso de uma célula inteira da grade (floor(p)): o mesmo para todos os pontos dentro dela. */
float lmCellHash(vec2 p) { return float(lmPcg3(uvec3(ivec3(ivec2(floor(p)), 7))).x) * LM_U2F; }
vec3 lmCellHash3(vec3 p) { return vec3(lmPcg3(uvec3(ivec3(floor(p))))) * LM_U2F; }
/**
 * Ruído de gradiente intercalado (Jimenez): espalha bem o erro entre pixels vizinhos. Bom para girar amostras
 * de desfoque e para dither, sem o chuvisco grosso do acaso puro. "pixel" = gl_FragCoord.xy.
 */
float lmIGN(vec2 pixel) { return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))); }
/** Acaso com distribuição de sino (gaussiana aproximada), média 0 e desvio 1. */
float lmGaussianNoise(vec3 p) {
  vec3 h = lmHash3(p);
  vec3 h2 = lmHash3(p + 17.31);
  return (h.x + h.y + h.z + h2.x + h2.y + h2.z - 3.0) * 1.41421356;
}

// ---------------------------------------------------------------- Ruído suave (gradiente, curva quíntica)
vec2 lmGrad2(vec2 cell) {
  float a = lmCellHash(cell) * 6.28318530718;
  return vec2(cos(a), sin(a));
}
/** Ruído de gradiente 2D, de -1 a 1, sem as quinas do ruído de valor. */
float lmNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(lmGrad2(i), f);
  float b = dot(lmGrad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(lmGrad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(lmGrad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.41421356;
}
vec3 lmGrad3(vec3 cell) { return normalize(lmCellHash3(cell) * 2.0 - 1.0 + 1e-4); }
/** Ruído de gradiente 3D, de -1 a 1 (use z = tempo para uma textura que evolui sem "pular"). */
float lmNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(lmGrad3(i), f);
  float n100 = dot(lmGrad3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0));
  float n010 = dot(lmGrad3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0));
  float n110 = dot(lmGrad3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0));
  float n001 = dot(lmGrad3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1));
  float n101 = dot(lmGrad3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1));
  float n011 = dot(lmGrad3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1));
  float n111 = dot(lmGrad3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 1.15470054;
}
/** Soma de oitavas (fbm): detalhe fino por cima do grosso. Até 8 oitavas; resultado perto de -1 a 1. */
float lmFbm(vec2 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * lmNoise(p);
    norm += amp;
    p = turn * p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}
float lmFbm(vec3 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * lmNoise(p);
    norm += amp;
    p = p * 2.03 + vec3(17.1, 31.7, 7.3);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}
/** Campo de rotação (curl) do ruído: desloca sem comprimir nem esticar (fumaça, água, distorção orgânica). */
vec2 lmCurl(vec2 p, float t) {
  const float e = 0.01;
  float n1 = lmNoise(vec3(p + vec2(0.0, e), t));
  float n2 = lmNoise(vec3(p - vec2(0.0, e), t));
  float n3 = lmNoise(vec3(p + vec2(e, 0.0), t));
  float n4 = lmNoise(vec3(p - vec2(e, 0.0), t));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

// ---------------------------------------------------------------- Cor
/** Luminância (Rec.709, a das câmeras e TVs HD). */
float lmLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/** sRGB (o que está na tela) ↔ luz linear (onde misturar, desfocar e somar brilho é fisicamente certo). */
vec3 lmToLinear(vec3 c) {
  c = max(c, 0.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 lmToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
/** Saturação (0 = cinza, 1 = igual, >1 = mais viva), mantendo a luminância. */
vec3 lmSaturate(vec3 c, float amount) { return max(mix(vec3(lmLuma(c)), c, amount), 0.0); }
/** Curva de filme (ACES, ajuste de Narkowicz): comprime as altas luzes em vez de estourar. Entrada linear. */
vec3 lmTonemap(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
/** Compressão suave das altas luzes acima de "knee" (sRGB): o branco chega em 1 sem bater no teto. */
vec3 lmSoftClip(vec3 c, float knee) {
  vec3 over = max(c - knee, 0.0);
  float room = 1.0 - knee;
  return min(c, vec3(knee)) + room * (1.0 - exp(-over / max(room, 1e-4)));
}
vec3 lmRgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 lmHsvToRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
/** Oklab (Ottosson): cor perceptual, para trocar matiz e saturação sem mudar o brilho percebido. Entrada linear. */
vec3 lmToOklab(vec3 c) {
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = sign(lms) * pow(abs(lms), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 lmFromOklab(vec3 c) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * lms;
}
/** Gira o matiz (radianos) em Oklab: a luminância percebida fica igual. Entrada e saída em sRGB. */
vec3 lmHueRotate(vec3 c, float angle) {
  vec3 lab = lmToOklab(lmToLinear(c));
  float s = sin(angle), k = cos(angle);
  lab.yz = mat2(k, s, -s, k) * lab.yz;
  return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
}
/** Temperatura (−1 frio a 1 quente) e matiz (−1 verde a 1 magenta), como o balanço de branco das câmeras. */
vec3 lmWhiteBalance(vec3 c, float temperature, float tint) {
  vec3 lin = lmToLinear(c);
  vec3 gain = vec3(1.0 + 0.30 * temperature, 1.0 - 0.18 * tint, 1.0 - 0.30 * temperature) * vec3(1.0 + 0.09 * tint, 1.0, 1.0 + 0.09 * tint);
  vec3 balanced = lin * gain;
  // Mantém a luminância: só a cor muda.
  balanced *= lmLuma(lin) / max(lmLuma(balanced), 1e-5);
  return lmToSrgb(balanced);
}

// ---------------------------------------------------------------- Modos de mistura (fórmulas W3C / Photoshop; a = base, b = camada)
vec3 lmMultiply(vec3 a, vec3 b) { return a * b; }
vec3 lmScreen(vec3 a, vec3 b) { return a + b - a * b; }
vec3 lmOverlay(vec3 a, vec3 b) { return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a)); }
vec3 lmHardLight(vec3 a, vec3 b) { return lmOverlay(b, a); }
vec3 lmSoftLight(vec3 a, vec3 b) {
  vec3 d = mix(((16.0 * a - 12.0) * a + 4.0) * a, sqrt(a), step(0.25, a));
  return mix(a - (1.0 - 2.0 * b) * a * (1.0 - a), a + (2.0 * b - 1.0) * (d - a), step(0.5, b));
}
vec3 lmColorDodge(vec3 a, vec3 b) { return mix(min(vec3(1.0), a / max(1.0 - b, 1e-4)), vec3(1.0), step(1.0, b)); }
vec3 lmColorBurn(vec3 a, vec3 b) { return mix(1.0 - min(vec3(1.0), (1.0 - a) / max(b, 1e-4)), vec3(0.0), step(b, vec3(0.0))); }
vec3 lmLinearLight(vec3 a, vec3 b) { return clamp(a + 2.0 * b - 1.0, 0.0, 1.0); }
/** Soma de luz feita em luz linear (como a luz se soma de verdade), devolvida em sRGB. */
vec3 lmAddLight(vec3 a, vec3 light) { return lmToSrgb(lmToLinear(a) + lmToLinear(light)); }

// ---------------------------------------------------------------- Geometria e bordas
/** n pixels de um vídeo 1080p, em uv de altura (o mesmo tamanho na tela em qualquer resolução). */
float lmPx(float n) { return n / 1080.0; }
/** Fração da altura → uv (x corrigido pela proporção da tela). */
vec2 lmPxUv(float n) { return vec2(n / 1080.0 / ratio, n / 1080.0); }
/** uv → coordenadas centradas com a proporção certa (círculo é círculo): x de −ratio/2 a ratio/2, y de −0,5 a 0,5. */
vec2 lmCentered(vec2 uv) { return (uv - 0.5) * vec2(ratio, 1.0); }
vec2 lmUncentered(vec2 p) { return p / vec2(ratio, 1.0) + 0.5; }
/** Coordenada espelhada nas bordas: o que sai do quadro vira reflexo, e não a faixa esticada do último pixel. */
vec2 lmMirror(vec2 uv) { return 1.0 - abs(mod(uv, 2.0) - 1.0); }
vec2 lmRotate(vec2 p, float angle) { float s = sin(angle), c = cos(angle); return mat2(c, s, -s, c) * p; }
/** Preenchimento sem serrilhado a partir de uma distância com sinal (negativa = dentro), em qualquer unidade. */
float lmFill(float sd) { return clamp(0.5 - sd / max(fwidth(sd), 1e-6), 0.0, 1.0); }
/** Borda com suavidade: "soft" na mesma unidade da distância (0 = só o antisserrilhado). */
float lmFill(float sd, float soft) { float w = max(fwidth(sd), soft); return 1.0 - smoothstep(-w * 0.5, w * 0.5, sd); }
/** Degrau sem serrilhado (como step, mas com a borda de 1 pixel suavizada). */
float lmStep(float edge, float x) { float w = max(fwidth(x), 1e-6) * 0.5; return smoothstep(edge - w, edge + w, x); }
float lmSdCircle(vec2 p, float r) { return length(p) - r; }
float lmSdBox(vec2 p, vec2 half_) { vec2 d = abs(p) - half_; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float lmSdRoundBox(vec2 p, vec2 half_, float r) { return lmSdBox(p, half_ - r) - r; }
float lmSdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
/** Vinheta de lente (cos⁴ suavizado), 1 no centro; "amount" 0 a 1, "roundness" 0 = segue a tela, 1 = círculo. */
float lmVignette(vec2 uv, float amount, float roundness) {
  vec2 p = (uv - 0.5) * mix(vec2(1.0), vec2(ratio, 1.0), roundness);
  float r = length(p) / mix(0.7071, 0.5 * length(vec2(ratio, 1.0)), roundness);
  float falloff = pow(cos(min(r * 0.95, 1.5707) ), 4.0);
  return mix(1.0, falloff, clamp(amount, 0.0, 1.0));
}

// ---------------------------------------------------------------- Curvas de animação (t de 0 a 1)
float lmEaseInSine(float t) { return 1.0 - cos(t * PI * 0.5); }
float lmEaseOutSine(float t) { return sin(t * PI * 0.5); }
float lmEaseInOutSine(float t) { return 0.5 - 0.5 * cos(PI * t); }
float lmEaseInCubic(float t) { return t * t * t; }
float lmEaseOutCubic(float t) { float u = 1.0 - t; return 1.0 - u * u * u; }
float lmEaseInOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5; }
float lmEaseInQuint(float t) { return t * t * t * t * t; }
float lmEaseOutQuint(float t) { return 1.0 - pow(1.0 - t, 5.0); }
float lmEaseInOutQuint(float t) { return t < 0.5 ? 16.0 * pow(t, 5.0) : 1.0 - pow(-2.0 * t + 2.0, 5.0) * 0.5; }
float lmEaseInExpo(float t) { return t <= 0.0 ? 0.0 : pow(2.0, 10.0 * t - 10.0); }
float lmEaseOutExpo(float t) { return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }
float lmEaseInOutExpo(float t) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  return t < 0.5 ? pow(2.0, 20.0 * t - 10.0) * 0.5 : (2.0 - pow(2.0, -20.0 * t + 10.0)) * 0.5;
}
float lmEaseOutBack(float t) { const float c1 = 1.70158; const float c3 = c1 + 1.0; float u = t - 1.0; return 1.0 + c3 * u * u * u + c1 * u * u; }
float lmEaseInOutBack(float t) {
  const float c2 = 1.70158 * 1.525;
  return t < 0.5 ? (pow(2.0 * t, 2.0) * ((c2 + 1.0) * 2.0 * t - c2)) * 0.5 : (pow(2.0 * t - 2.0, 2.0) * ((c2 + 1.0) * (t * 2.0 - 2.0) + c2) + 2.0) * 0.5;
}
/** Mola amortecida: sai de 0, passa um pouco de 1 e assenta. "bounces" ~1 a 4; "damping" ~4 a 10. */
float lmSpring(float t, float bounces, float damping) {
  t = clamp(t, 0.0, 1.0);
  return 1.0 - exp(-damping * t) * cos(bounces * 2.0 * PI * t);
}
/** Sino suave de 0 a 1 e de volta a 0 (pico em t = 0,5): para o que aparece no meio da transição. */
float lmBell(float t) { return sin(clamp(t, 0.0, 1.0) * PI); }
/** Pulso que sobe rápido e cai devagar, com pico em "peak" (0 a 1). */
float lmPulse(float t, float peak) {
  t = clamp(t, 0.0, 1.0);
  return t < peak ? lmEaseOutCubic(t / max(peak, 1e-4)) : 1.0 - lmEaseInOutSine((t - peak) / max(1.0 - peak, 1e-4));
}
`;

/**
 * Funções que leem a imagem (desfoque, brilho, aberração, grão). Os efeitos e filtros têm uma entrada só (getColor);
 * as transições têm duas (getFromColor e getToColor): o mesmo código sai para cada uma com outro nome.
 * `lod` = a versão da função que lê o mapa de níveis (mipmaps), que o motor só monta quando o plugin usa.
 */
function samplerLib(read: string, readLod: string, suffix: string): string {
  return `
/** Desfoque em disco (bokeh de lente) com raio em uv de altura; 32 amostras numa espiral áurea girada por pixel. */
vec4 lmDiskBlur${suffix}(vec2 uv, float radius) {
  if (radius <= 0.0) return ${read}(uv);
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 32; i++) {
    float r = sqrt((float(i) + 0.5) / 32.0);
    float a = float(i) * 2.39996323 + spin;
    vec2 o = vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0);
    vec4 s = ${read}(uv + o);
    s.rgb = lmToLinear(s.rgb);
    sum += s;
    total += 1.0;
  }
  sum /= total;
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
/** Desfoque gaussiano (raio = 3 desvios, em uv de altura), em luz linear. */
vec4 lmGaussianBlur${suffix}(vec2 uv, float radius) {
  if (radius <= 0.0) return ${read}(uv);
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 40; i++) {
    float r = sqrt((float(i) + 0.5) / 40.0);
    float a = float(i) * 2.39996323 + spin;
    float w = exp(-4.5 * r * r);
    vec2 o = vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0);
    vec4 s = ${read}(uv + o);
    s.rgb = lmToLinear(s.rgb);
    sum += s * w;
    total += w;
  }
  sum /= total;
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
/** Rastro de movimento ao longo de "dir" (uv), centrado no ponto, como o obturador aberto de uma câmera. */
vec4 lmMotionBlur${suffix}(vec2 uv, vec2 dir, int samples) {
  int n = clamp(samples, 1, 48);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float k = (float(i) + jitter) / float(n) - 0.5;
    vec4 s = ${read}(uv + dir * k);
    s.rgb = lmToLinear(s.rgb);
    sum += s;
  }
  sum /= float(n);
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
/** Zoom borrado (desfoque radial) a partir de "center" (uv): "amount" = quanto o raio estica (0,1 = 10%). */
vec4 lmZoomBlur${suffix}(vec2 uv, vec2 center, float amount, int samples) {
  int n = clamp(samples, 1, 48);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float k = 1.0 - amount * (float(i) + jitter) / float(n);
    vec4 s = ${read}(center + (uv - center) * k);
    s.rgb = lmToLinear(s.rgb);
    sum += s;
  }
  sum /= float(n);
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
/**
 * Aberração cromática de lente: as cores se separam do centro para as bordas, com o espectro contínuo
 * (vermelho → amarelo → verde → azul), não só três cópias. "amount" em uv de altura, na borda.
 */
vec4 lmChromatic${suffix}(vec2 uv, vec2 center, float amount) {
  vec2 d = (uv - center);
  vec3 sum = vec3(0.0), weight = vec3(0.0);
  float jitter = lmIGN(gl_FragCoord.xy) - 0.5;
  for (int i = 0; i < 9; i++) {
    float k = (float(i) + 0.5 + jitter * 0.5) / 9.0;
    // Peso de cada faixa do espectro em R, G e B.
    vec3 w = clamp(vec3(1.5 - abs(k * 4.0 - 0.5), 1.5 - abs(k * 4.0 - 2.0), 1.5 - abs(k * 4.0 - 3.5)), 0.0, 1.0);
    // Aumento por cor: o desvio cresce do centro (zero) para a borda (amount), como numa lente real.
    vec2 o = d * (1.0 + (k - 0.5) * amount * 4.0);
    sum += lmToLinear(${read}(center + o).rgb) * w;
    weight += w;
  }
  return vec4(lmToSrgb(sum / weight), ${read}(uv).a);
}
/** A imagem num nível de detalhe: 0 = nítida, cada +1 = metade da resolução (precisa do mapa de níveis). */
vec4 lmLod${suffix}(vec2 uv, float level) { return ${readLod}(uv, level); }
/**
 * Brilho de lente (bloom) suave e largo: soma as altas luzes em vários níveis de detalhe (como os motores de cinema),
 * sem os blocos da grade de amostras. "radius" = 0 a 1 (quanto se espalha); devolve só a luz extra, em luz linear.
 * O espalhamento é uma fração da altura do quadro: o mesmo em 720p, 1080p, 4K e na miniatura.
 */
vec3 lmBloom${suffix}(vec2 uv, float threshold, float radius) {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  float maxLevel = mix(3.0, 7.5, clamp(radius, 0.0, 1.0));
  // Os níveis contam a partir de 720p (onde os plugins foram ajustados): em 4K, o nível 1 de 720p é o 2,58.
  float shift = log2(max(resolution.y, 1.0) / 720.0);
  for (int i = 1; i <= 8; i++) {
    if (float(i) > maxLevel + 0.5) break;
    float level = max(float(i) + shift, 0.0);
    float w = exp(-0.35 * float(i)) * (1.0 + float(i) * 0.25);
    vec2 texel = exp2(level) / resolution;
    vec3 c = vec3(0.0);
    // Filtro em tenda de 9 toques em cada nível: sem quadriculado.
    c += ${readLod}(uv, level).rgb * 4.0;
    c += (${readLod}(uv + vec2(texel.x, 0.0), level).rgb + ${readLod}(uv - vec2(texel.x, 0.0), level).rgb + ${readLod}(uv + vec2(0.0, texel.y), level).rgb + ${readLod}(uv - vec2(0.0, texel.y), level).rgb) * 2.0;
    c += ${readLod}(uv + texel, level).rgb + ${readLod}(uv - texel, level).rgb + ${readLod}(uv + vec2(texel.x, -texel.y), level).rgb + ${readLod}(uv + vec2(-texel.x, texel.y), level).rgb;
    c = lmToLinear(c / 16.0);
    float l = lmLuma(c);
    float knee = max(threshold * 0.5, 1e-4);
    float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
    float contribution = max(soft * soft / (4.0 * knee), l - threshold) / max(l, 1e-4);
    sum += c * contribution * w;
    total += w;
  }
  return sum / max(total, 1e-4);
}
`;
}

/**
 * Grão de filme de verdade: aglomerados de tamanho "size" (pixels de 1080p), mais forte nos meios-tons que nas
 * sombras e altas luzes (como na película), com cor levemente diferente por canal e um quadro de grão a cada
 * 1/24 s. "amount" 0 a 1. Entrada e saída em sRGB.
 */
const GRAIN = `
vec3 lmFilmGrain(vec3 color, vec2 uv, float amount, float size, float seconds) {
  float frame = floor(seconds * 24.0);
  vec2 p = uv * resolution / max(size * resolution.y / 1080.0, 0.5);
  // Dois níveis de ruído suave somados: aglomerados irregulares, sem a grade de células.
  float coarse = lmNoise(vec3(p, frame * 1.37));
  float fine = lmNoise(vec3(p * 2.1 + 3.7, frame * 1.37 + 9.1));
  float n = coarse * 0.65 + fine * 0.35;
  // A cor de cada canal varia um pouco (as três camadas da película) reaproveitando os dois ruídos: 2 em vez de 5.
  vec3 tint = vec3(fine, coarse - fine, -fine);
  vec3 grain = vec3(n) * 0.85 + tint * 0.15;
  float l = lmLuma(color);
  // Resposta da película: o grão aparece mais nos meios-tons.
  float response = 0.35 + 2.6 * l * (1.0 - l);
  return clamp(color + grain * amount * 0.16 * response, 0.0, 1.0);
}
`;

/** Biblioteca dos efeitos e filtros (getColor). */
export const EFFECT_LIB = `${GLSL_LIB}${samplerLib('getColor', 'getColorLod', '')}${GRAIN}`;
/** Biblioteca das transições: as funções de imagem saem para os dois clipes (…From e …To). */
export const TRANSITION_LIB = `${GLSL_LIB}${samplerLib('getFromColor', 'getFromColorLod', 'From')}${samplerLib('getToColor', 'getToColorLod', 'To')}`;

/** O plugin chama alguma função que lê o mapa de níveis (o motor só monta os mipmaps quando precisa). */
export const LOD_CALL = /\b(lmBloom|lmLod)(From|To)?\s*\(|\bget(From|To)?ColorLod\s*\(/;
