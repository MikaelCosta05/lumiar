// Noir: o P&B dos filmes policiais dos anos 40 (película Eastman Double-X, luz dura, sombras fundas).
// - Exposição pancromática em luz linear; curva de papel dura com pé longo: as sombras ficam densas mas ainda
//   mostram a textura do cabelo e do terno.
// - Brilho das lentes da época em volta das luzes (halo suave, níveis de detalhe), somado como luz.
// - Vinheta de lente (cos⁴) com a proporção certa, aplicada em luz linear.
// - Grão de película a 24 quadros por segundo, mais visível nos meios-tons.

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
  float l = mix(0.012, 0.975, paperCurve(v, 9.0, 0.54));
  float lin = lmToLinear(vec3(l)).x;
  lin += lmLuma(lmBloom(uv, 0.62, 0.45)) * 0.32;
  lin *= lmVignette(uv, 0.9, 0.55);
  l = lmSoftClip(lmToSrgb(vec3(lin)), 0.88).x;
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.5, 1.5, time));
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
