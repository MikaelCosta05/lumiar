// P&B com brilho etéreo, como um retrato de Hollywood com filtro de difusão (Pro-Mist) na lente:
// - Exposição pancromática em luz linear e curva de papel macia.
// - As altas luzes espalham um halo largo e suave (níveis de detalhe, sem cópias nem quadriculado), somado como
//   luz e com o ombro comprimido: brilha sem estourar a imagem em branco.
// - Grão fino.

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
  float l = mix(0.02, 0.94, paperCurve(v, 3.0, 0.43));
  float glow = lmLuma(lmBloom(uv, 0.3, 0.65));
  float lin = lmToLinear(vec3(l)).x * (1.0 - 0.15 * min(glow, 1.0)) + glow * 1.7;
  l = lmSoftClip(lmToSrgb(vec3(lin)), 0.74).x;
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.1, 1.1, time));
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
