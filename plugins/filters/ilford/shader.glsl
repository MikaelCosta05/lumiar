// Ilford HP5 Plus revelado normal e ampliado em papel de fibra:
// - Emulsão pancromática (um pouco mais sensível ao azul que o olho), somada em luz linear.
// - Curva de contraste médio com latitude larga: sombras abertas, altas luzes com ombro suave, preto denso do
//   papel (não 0 absoluto) e branco do papel levemente abaixo de 1.
// - Grão médio de 400 ISO (aglomerados de ~1,6 px em 1080p), a 24 quadros por segundo, mais forte nos meios-tons.

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
  float v = filmExposure(c.rgb, vec3(0.26, 0.60, 0.14));
  float l = mix(0.018, 0.965, paperCurve(v, 4.4, 0.45));
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.7, 1.6, time));
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
