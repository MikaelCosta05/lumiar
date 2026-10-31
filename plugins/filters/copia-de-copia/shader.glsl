// Cópia de cópia: fita VHS regravada várias gerações. A cada cópia a luma perde banda (fica mole), o realce dos
// aparelhos soma halos (o contorno duplicado claro e escuro ao lado das bordas), a croma borra mais, atrasa e
// perde força e matiz, o preto sobe, o contraste cai e o chiado de fita se acumula (riscos deitados ao longo das
// 480 linhas, quadro a quadro) e as linhas tremem um pouco mais.

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
  float field = floor(time * 59.94);
  float line = floor((1.0 - uv.y) * LINES);
  // Base de tempo: cada geração soma um pouco de tremor por linha.
  float jitter = (lmNoise(vec2(line * 0.03, field * 0.37)) * 1.5 + (lmHash(vec3(line, frame, 3.0)) - 0.5) * 0.8) * gen;
  vec2 p = vec2(uv.x - lmPxUv(jitter).x, uv.y);
  // Luma mole e os halos de várias passagens pelo realce.
  float soft = lumaBlur(p, 1.0 + gen * 3.0);
  float wide = lumaBlur(p, 4.0 + gen * 5.0);
  float Y = soft + (soft - wide) * (0.4 + 1.4 * ghost);
  // O "contorno duplicado": o realce de uma cópia anterior chega deslocado alguns px para a direita.
  vec2 e = vec2(lmPxUv(6.0 + 4.0 * gen).x, 0.0);
  float echo = lumaBlur(p - e, 1.0 + gen * 3.0) - lumaBlur(p - e, 4.0 + gen * 5.0);
  Y += echo * 0.9 * ghost;
  // Croma: borrada, atrasada, mais fraca e com o matiz escorregando.
  vec2 iq = tapeChroma(p, 0.003 + 0.009 * gen, 0.002 + 0.006 * gen) * (1.0 - gen * 0.5);
  float a = 0.12 * gen;
  iq = mat2(cos(a), sin(a), -sin(a), cos(a)) * iq;
  // Preto sobe, contraste cai.
  Y = mix(Y, 0.45, gen * 0.28) + 0.02 * gen;
  // Chiado acumulado.
  float n = streak(uv.x * 380.0, line, frame) * 0.65 + streak(uv.x * 130.0, line, frame + 0.5) * 0.35;
  Y += n * 0.06 * gen * mix(1.3, 0.6, Y);
  iq += vec2(streak(uv.x * 45.0, line, frame + 0.25), streak(uv.x * 40.0, line, frame + 0.75)) * 0.03 * gen;
  vec3 col = toRgb(vec3(Y, iq));
  col *= scanlines(uv, 0.12 * gen, Y);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
