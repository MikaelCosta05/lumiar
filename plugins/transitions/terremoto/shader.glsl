// Terremoto: a câmera treme com ruído suave (posição e um pouco de giro), cada vez mais forte até o pico, onde a
// troca acontece, e depois amortece. Os "ecos" são o desfoque de movimento de verdade: o rastro segue a
// velocidade do tremor em cada pixel (incluindo o giro). A imagem fica levemente ampliada na medida exata do
// tremor, então a borda nunca aparece.

float expIn(float x, float k) { return (exp(k * x) - 1.0) / (exp(k) - 1.0); }

/** Força do tremor no tempo t: cresce acelerando até o meio e amortece depois. */
float envelope(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return expIn(2.0 * t, 3.0);
  float x = 2.0 * t - 1.0;
  return exp(-3.5 * x) * (1.0 - x);
}

/** Ponto da imagem que aparece em "s" (coordenadas centradas) no tempo t. */
vec2 shaken(vec2 s, float t) {
  float env = envelope(t) * strength;
  float f = t * 26.0;
  vec2 offset = vec2(lmNoise(vec2(f, 3.1)), lmNoise(vec2(f, 8.7))) * 0.035 * env;
  float angle = lmNoise(vec2(f * 0.7, 5.5)) * 0.018 * env;
  float scale = 1.0 + 0.09 * env;
  return lmUncentered(lmRotate(s + offset, angle) / scale);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 s = lmCentered(uv);
  const float shutter = 0.05;
  vec2 q = shaken(s, progress);
  vec2 dir = shaken(s, progress + shutter * 0.5) - shaken(s, progress - shutter * 0.5);
  int n = int(clamp(ceil(length(dir * resolution) / 2.0), 1.0, 32.0));
  float m = smoothstep(0.485, 0.515, progress);
  vec3 col = vec3(0.0);
  if (m < 1.0) col += lmToLinear(lmMotionBlurFrom(q, dir, n).rgb) * (1.0 - m);
  if (m > 0.0) col += lmToLinear(lmMotionBlurTo(q, dir, n).rgb) * m;
  return vec4(lmToSrgb(col), 1.0);
}
