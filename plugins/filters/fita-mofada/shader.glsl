// Fita mofada: fungo crescendo no óxido da fita. As colônias são manchas orgânicas (fbm com o domínio torcido),
// com o miolo escuro esverdeado, uma textura de fungo por dentro e uma borda clara de poeira; elas derivam devagar
// enquanto a fita passa. A cor apagou e o mofo arranca o óxido: riscos de dropout (uma linha, começo nítido e rabo
// que apaga) piscam por quadro de vídeo, mais perto das manchas. Um pouco de oscilação de brilho e vinheta.

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
  vec3 col = lmSaturate(c.rgb, 0.4) * vec3(0.95, 1.0, 0.93);
  col = col * 0.88 + vec3(0.04, 0.045, 0.035);
  // Colônias de mofo.
  vec2 p = lmCentered(uv) * mix(6.0, 2.2, spot) + vec2(0.0, time * 0.02);
  vec2 warp = vec2(lmFbm(p * 1.3 + 3.0, 3), lmFbm(p * 1.3 + 9.0, 3));
  float n = lmFbm(p + warp * 0.9, 5) * 0.5 + 0.5;
  float th = 0.74 - mold * 0.2;
  float aa = fwidth(n) + 0.01;
  float m = smoothstep(th, th + 0.08 + aa, n);
  float rim = smoothstep(th - 0.03 - aa, th, n) * (1.0 - smoothstep(th, th + 0.025 + aa, n));
  // Textura do fungo: filamentos finos (ruído de alta frequência), mais escuro no miolo.
  float fiber = lmFbm(uv * vec2(ratio, 1.0) * 90.0, 3) * 0.5 + 0.5;
  float core = smoothstep(th + 0.05, th + 0.2, n);
  vec3 moldCol = vec3(0.07, 0.085, 0.05) * (0.6 + 0.8 * fiber) * (1.0 - 0.4 * core);
  col = mix(col, moldCol, m * 0.88);
  col += rim * vec3(0.09, 0.1, 0.07) * mold;
  // Esporos soltos: pontinhos orgânicos, poucos.
  float spores = smoothstep(0.78, 0.86, lmNoise(uv * vec2(ratio, 1.0) * 140.0) * 0.5 + 0.5) * mold;
  col = mix(col, vec3(0.1, 0.11, 0.07), spores * 0.6);
  // Dropouts: mais prováveis onde há mofo.
  float near = smoothstep(th - 0.15, th, n);
  float on = step(1.0 - mold * (0.002 + 0.01 * near), lmHash(vec3(line, frame, 5.0)));
  float x0 = lmHash(vec3(line, frame, 6.0));
  float len = 0.02 + 0.1 * lmHash(vec3(line, frame, 7.0));
  float tt = (uv.x - x0) / len;
  float body = smoothstep(-0.03, 0.0, tt) * (1.0 - smoothstep(0.3, 1.0, tt)) * on;
  col = mix(col, vec3(0.9), body * 0.75);
  // Brilho oscilando (o ganho da fita) e vinheta.
  col *= 1.0 + lmNoise(vec2(time * 4.0, 2.0)) * 0.04;
  col *= lmVignette(uv, 0.5, 0.5);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
