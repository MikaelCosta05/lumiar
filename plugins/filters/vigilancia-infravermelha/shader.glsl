// Vigilância infravermelha (visão noturna): no infravermelho próximo a pele e as folhas refletem muito, então o canal
// vermelho pesa mais na claridade. O ganho automático puxa a imagem escura e, junto, o chiado do sensor: grãos de
// vídeo fortes nas sombras, por linha e por quadro. O iluminador de LEDs deixa o centro mais claro e os cantos no
// escuro, as luzes fortes estouram com halo (bloom em luz linear), e tudo vira o fósforo da cor escolhida, com as
// altas luzes indo para o branco. Linhas de varredura de 240 por campo.

// ---- Sinal de vídeo analógico (NTSC): 480 linhas, 29,97 quadros e 59,94 campos por segundo.
const float LINES = 480.0;
vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }
/** Ruído suave ao longo da linha (x em células), independente de uma linha para a outra: -1 a 1. */
float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}
/** Chuvisco gaussiano ao longo da linha (a forma do ruído que passou pela banda do vídeo): média 0, desvio ~1. */
float snow(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = lmGaussianNoise(vec3(i, line, seed));
  float b = lmGaussianNoise(vec3(i + 1.0, line, seed));
  return mix(a, b, f) / sqrt(f * f + (1.0 - f) * (1.0 - f));
}
/** Luma lida ao longo da linha com uma gaussiana de desvio "sigma" (px de 1080p). */
float lumaBlur(vec2 uv, float sigma) {
  if (sigma < 0.05) return lmLuma(getColor(uv).rgb);
  float sum = 0.0, tot = 0.0;
  for (int i = -4; i <= 4; i++) {
    float k = float(i) * 0.6;
    float w = exp(-0.5 * k * k);
    sum += lmLuma(getColor(uv + vec2(lmPxUv(k * sigma).x, 0.0)).rgb) * w;
    tot += w;
  }
  return sum / tot;
}
/** Croma (I/Q) da fita: gaussiana larga atrasada para a direita, alternando com a linha de cima (filtro de 1H). */
vec2 tapeChroma(vec2 uv, float sigma, float delay) {
  vec2 sum = vec2(0.0);
  float tot = 0.0;
  for (int i = 0; i < 14; i++) {
    float k = (float(i) - 6.5) / 6.5 * 2.2;
    float w = exp(-0.5 * k * k);
    vec2 q = vec2(uv.x - delay + k * sigma, uv.y + (i % 2 == 0 ? 0.0 : 1.0 / LINES));
    sum += toYiq(getColor(q).rgb).yz * w * step(0.0, q.x) * step(q.x, 1.0);
    tot += w;
  }
  return sum / tot;
}
/** Linhas de varredura de 240 por campo, que somem (sem moiré) quando a tela é pequena demais para mostrá-las. */
float scanlines(vec2 uv, float amount, float lum) {
  float pitch = resolution.y / 240.0;
  float s = 0.5 - 0.5 * cos((1.0 - uv.y) * 240.0 * 2.0 * PI);
  float depth = amount * mix(1.0, 0.45, clamp(lum, 0.0, 1.0)) * smoothstep(1.6, 3.2, pitch);
  return (1.0 - depth * s) * (1.0 + depth * 0.5);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float frame = floor(time * 29.97);
  float line = floor((1.0 - uv.y) * LINES);
  vec3 lin = lmToLinear(c.rgb);
  // Claridade no infravermelho (vermelho pesa mais) + o halo das luzes fortes.
  float ir = dot(lin, vec3(0.55, 0.35, 0.10));
  ir += dot(lmBloom(uv, 0.5, 0.5), vec3(0.55, 0.35, 0.10)) * 1.2;
  // Iluminador: centro mais claro.
  vec2 p = lmCentered(uv);
  ir *= 0.65 + 0.7 * exp(-dot(p, p) * 1.6);
  // Ganho automático (curva que levanta o escuro) e chiado que cresce com o ganho.
  float g = 3.0 + gain * 9.0;
  float l = 1.0 - exp(-ir * g);
  float n = snow(uv.x * 340.0, line, frame) * 0.75 + snow(uv.x * 120.0, line, frame + 0.5) * 0.35;
  l += n * noiseAmt * 0.16 * (0.3 + gain) * (1.1 - l);
  l = clamp(l, 0.0, 1.0);
  vec3 phosphor = tint / max(max(tint.r, max(tint.g, tint.b)), 1e-3);
  vec3 col = phosphor * l + vec3(smoothstep(0.7, 1.0, l) * 0.5);
  col *= scanlines(uv, 0.15, l);
  col *= lmVignette(uv, 0.6, 0.8);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
