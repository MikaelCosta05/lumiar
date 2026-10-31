// Exposição automática: clareia ou escurece pela luz da cena, como o fotômetro da câmera. Mede a média logarítmica
// da luminância (luz linear) numa grade 5×5 do mapa de níveis, com peso maior no centro (medição ponderada ao
// centro), e leva essa média para perto do cinza médio (20%). A correção é em stops (ganho em luz linear), limitada a
// +1,5 / −1 stop, e as altas luzes que passariam de 1 são comprimidas em vez de estourar.
vec4 applyFilter(vec4 c, vec2 uv) {
  float level = log2(resolution.y / 7.0);
  float sum = 0.0, wsum = 0.0;
  for (int j = 0; j < 5; j++) {
    for (int i = 0; i < 5; i++) {
      vec2 p = (vec2(float(i), float(j)) + 0.5) / 5.0;
      float y = lmLuma(lmToLinear(getColorLod(p, level).rgb));
      vec2 d = (p - 0.5) * vec2(ratio, 1.0);
      float w = mix(0.35, 1.0, exp(-dot(d, d) * 6.0));
      sum += log2(max(y, 1e-3)) * w;
      wsum += w;
    }
  }
  float stops = log2(0.2) - sum / wsum;
  stops = stops > 0.0 ? 1.5 * tanh(stops / 1.5) : -tanh(-stops);
  vec3 lin = lmToLinear(c.rgb) * exp2(stops);
  return vec4(lmSoftClip(lmToSrgb(lin), 0.85), c.a);
}
