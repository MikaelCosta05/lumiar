// Estática fria: imagem fria e quase sem cor afogada no chuvisco de uma TV com sinal fraco. O chuvisco tem a forma
// do ruído de vídeo (grãos gaussianos deitados ao longo das 480 linhas, novos a cada campo), o nível do sinal vai e
// volta devagar e, quando cai, as linhas escorregam de lado e o chiado toma conta. De vez em quando uma linha
// inteira estoura de interferência.

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
  float field = floor(time * 59.94);
  float frame = floor(time * 29.97);
  float ypos = (1.0 - uv.y) * LINES;
  float line = floor(ypos);
  // Quando o sinal cai, as linhas escorregam para os lados.
  float drop = smoothstep(0.2, 0.75, lmNoise(vec2(time * 1.7, 4.0)) * 0.5 + 0.5) * weak;
  float slip = (lmNoise(vec2(ypos * 0.05, time * 3.0)) * 10.0 + (lmHash(vec3(line, field, 1.0)) - 0.5) * 8.0) * drop;
  vec3 base = getColor(vec2(uv.x - lmPxUv(slip).x, uv.y)).rgb;
  vec3 col = lmWhiteBalance(lmSaturate(base, 0.22), -0.55, -0.05);
  col = mix(vec3(0.42), col, 0.85);
  float n = snow(uv.x * 450.0, line, field) * 0.8 + snow(uv.x * 140.0, line, field + 0.5) * 0.35;
  vec3 noise = vec3(clamp(0.46 + n * 0.2, 0.0, 1.0)) * vec3(0.9, 0.97, 1.05);
  col = mix(col, noise, clamp(hiss * 0.32 + drop * 0.6, 0.0, 1.0));
  // Linha de interferência que estoura (começa e termina suave).
  float burst = step(0.993 - weak * 0.01, lmHash(vec3(line, frame, 3.0)));
  float x0 = lmHash(vec3(line, frame, 4.0)) * 0.8;
  float run = smoothstep(x0 - 0.02, x0, uv.x) * (1.0 - smoothstep(x0 + 0.15, x0 + 0.5, uv.x));
  col = mix(col, vec3(0.88, 0.93, 1.0) * (0.75 + 0.25 * n), burst * run * 0.6 * (0.5 + 0.5 * hiss));
  col *= scanlines(uv, 0.1, lmLuma(col));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
