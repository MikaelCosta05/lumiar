// Transmissão de emergência: o sinal de alerta de uma emissora pequena. Cor fria e chapada, pretos acinzentados
// (o nível de preto mal ajustado), a imagem um pouco mole na horizontal (banda do vídeo), degraus de cor de um
// gerador de caracteres barato, linhas de varredura de 240 por campo (que somem na tela pequena, sem moiré), a
// barra de zumbido subindo e chiado de vídeo fino.

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
  float line = floor((1.0 - uv.y) * LINES);
  vec2 o = lmPxUv(1.6);
  vec3 s = (c.rgb * 2.0 + getColor(uv + vec2(o.x, 0.0)).rgb + getColor(uv - vec2(o.x, 0.0)).rgb) * 0.25;
  vec3 col = lmWhiteBalance(lmSaturate(s, 0.4), -0.45, 0.0);
  col = col * 0.74 + vec3(0.13, 0.14, 0.16);
  // Degraus de cor: quantização com um meio-pixel de dither de linha (degrau limpo, sem serrilhar).
  float levels = mix(48.0, 7.0, steps);
  col = floor(col * levels + 0.5) / levels;
  col *= scanlines(uv, scan * 0.45, lmLuma(col));
  float hum = 0.5 + 0.5 * cos((uv.y + time * 0.12) * 2.0 * PI);
  col *= 1.0 - 0.07 * hum * hum;
  col += snow(uv.x * 450.0, line, field) * 0.02;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
