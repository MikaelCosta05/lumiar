// Cortes rápidos: alterna entre os dois clipes em cortes que ficam cada vez mais próximos (ritmo que acelera, como
// numa edição na batida) até ficar no próximo. Cada corte vem com um soco de zoom que decai rápido (com o
// desfoque radial que a velocidade do zoom dá) e um lampejo de exposição de um ou dois quadros.

const int CUTS = 7;
const float CUT_AT[7] = float[7](0.16, 0.30, 0.42, 0.52, 0.60, 0.67, 0.73);

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  int seg = 0;
  float last = -1.0;
  for (int i = 0; i < CUTS; i++) {
    if (progress >= CUT_AT[i]) { seg = i + 1; last = CUT_AT[i]; }
  }
  bool next = (seg % 2) == 1;
  float punch = 0.0;
  float velocity = 0.0;
  float flash = 0.0;
  if (last >= 0.0) {
    float x = progress - last;
    float fade = 1.0 - smoothstep(0.88, 1.0, progress);
    punch = 0.075 * exp(-x / 0.035) * fade;
    velocity = punch / 0.035;
    flash = exp(-x / 0.012) * fade;
  }
  float z = 1.0 + punch;
  vec2 q = (uv - 0.5) / z + 0.5;
  // Rastro do zoom durante ~1/2 quadro (fração da escala percorrida nesse tempo).
  float amount = velocity * 0.05 / z;
  int n = int(clamp(ceil(amount * length(resolution) * 0.5 / 2.5), 1.0, 24.0));
  vec4 c = next ? lmZoomBlurTo(q, vec2(0.5), amount, n) : lmZoomBlurFrom(q, vec2(0.5), amount, n);
  vec3 lin = lmToLinear(c.rgb) * (1.0 + 0.9 * flash);
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.8), clamp(flash * 3.0, 0.0, 1.0));
  return vec4(col, c.a);
}
