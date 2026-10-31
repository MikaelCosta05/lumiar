// Duotone: mapa de degradê entre as duas cores, interpolado em Oklab (o meio do caminho não fica barrento nem
// escuro, como acontece misturando RGB), com o contraste por curva em S em volta do meio-tom (as pontas chegam nas
// cores sem cortar seco).

float contrastCurve(float x, float k) {
  x = clamp(x, 0.0, 1.0);
  if (k <= 1.0) return mix(0.5, x, k);
  float a = pow(x, k);
  float b = pow(1.0 - x, k);
  return a / max(a + b, 1e-6);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float t = contrastCurve(lmLuma(c.rgb), contrast);
  vec3 a = lmToOklab(lmToLinear(dark));
  vec3 b = lmToOklab(lmToLinear(light));
  vec3 col = lmToSrgb(max(lmFromOklab(mix(a, b, t)), 0.0));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
