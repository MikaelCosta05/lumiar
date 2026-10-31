// P&B delicado: cópia de baixo contraste em papel fosco, como um retrato de estúdio com filtro de difusão.
// - Exposição pancromática em luz linear; curva macia com o preto do papel fosco (levantado, sem "buraco") e o
//   branco um pouco abaixo de 1. Uma leve S mantém os meios-tons com vida (não fica cinza lavado).
// - Difusão suave nas luzes (níveis de detalhe, somada como luz).
// - Grão fino de película de 100 ISO (T-Max), quase imperceptível.

float filmExposure(vec3 c, vec3 w) {
  return lmToSrgb(vec3(max(dot(lmToLinear(c), w / dot(w, vec3(1.0))), 0.0))).x;
}

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float v = filmExposure(c.rgb, vec3(0.25, 0.62, 0.13));
  float l = mix(0.085, 0.935, paperCurve(v, 1.8, 0.46));
  float lin = lmToLinear(vec3(l)).x + lmLuma(lmBloom(uv, 0.55, 0.5)) * 0.16;
  l = lmSoftClip(lmToSrgb(vec3(lin)), 0.86).x;
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.1, 1.0, time));
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
