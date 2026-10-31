// VHS doente: fita com a cor adoecida. O caminho de sinal do videocassete (croma borrada, atrasada e alternando com
// a linha de cima; luma um pouco mole) com a cor virada para o verde-amarelado, pretos lavados e altas luzes
// amareladas; uma faixa de tracking passa devagar, com as linhas deslizando de lado e riscos claros deitados, e o
// chiado de fita fica por cima, por linha e por quadro de vídeo (29,97 por segundo).

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
  float yd = 1.0 - uv.y;
  float line = floor(yd * LINES);
  // Faixa de tracking subindo devagar.
  float d = yd - (1.0 - fract(time * 0.08));
  d -= floor(d + 0.5);
  float inBand = (1.0 - smoothstep(0.012, 0.04, abs(d))) * track;
  float jitter = (lmHash(vec3(line, frame, 1.0)) - 0.4) * 40.0 * inBand + (lmHash(vec3(line, frame, 2.0)) - 0.5) * 1.2;
  vec2 q = vec2(uv.x - lmPxUv(jitter).x, uv.y);
  float Y = lumaBlur(q, 1.4);
  vec2 iq = tapeChroma(q, 0.006, 0.005);
  vec3 col = toRgb(vec3(Y, iq));
  // A cor adoecida: verde-amarelado, preto lavado, altas luzes amareladas.
  vec3 sickCol = lmSaturate(col, 0.5) * vec3(0.9, 1.02, 0.66);
  sickCol = sickCol * 0.86 + vec3(0.05, 0.08, 0.03);
  sickCol = mix(sickCol, vec3(0.95, 0.95, 0.62) * lmLuma(sickCol) * 1.1, smoothstep(0.7, 1.0, Y) * 0.4);
  col = mix(col, sickCol, sick);
  // Chiado de fita e os riscos da faixa.
  float n = streak(uv.x * 380.0, line, frame) * 0.65 + streak(uv.x * 130.0, line, frame + 0.5) * 0.35;
  col += n * 0.05 * mix(1.3, 0.6, Y);
  float white = smoothstep(0.78, 0.95, streak(uv.x * 160.0, line, frame + 0.25) * 0.5 + 0.5) * inBand;
  col = mix(col, vec3(0.9, 0.95, 0.8), white * 0.8);
  col *= scanlines(uv, 0.15, Y);
  col *= lmVignette(uv, 0.35, 0.5);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
