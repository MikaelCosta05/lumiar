// Listras diagonais: faixas a 45° na tela (com a proporção corrigida, não na diagonal do uv) vão sendo pintadas
// com o próximo clipe, uma depois da outra, cada uma crescendo com aceleração a partir de uma borda. A borda que
// avança é antisserrilhada pela cobertura exata do pixel.
vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float n = max(floor(count + 0.5), 1.0);
  vec2 p = lmCentered(uv);
  float extent = (ratio + 1.0) * 0.5;
  float s = (p.x + p.y) / extent * 0.5 + 0.5;  // 0 a 1 ao longo da diagonal
  float c = s * n;
  float idx = clamp(floor(c), 0.0, n - 1.0);
  float f = c - idx;
  float e = lmEaseInOutCubic(clamp((progress - idx / n * 0.5) / 0.5, 0.0, 1.0));
  // Fração do pixel (largura w, em unidades de faixa) que cai dentro da parte já pintada [0, e].
  float w = max(fwidth(c), 1e-4);
  float m = clamp((min(f + w * 0.5, e) - max(f - w * 0.5, 0.0)) / w, 0.0, 1.0);
  if (e >= 1.0) m = 1.0;
  vec4 a = getFromColor(uv);
  vec4 b = getToColor(uv);
  return vec4(lmToSrgb(mix(lmToLinear(a.rgb), lmToLinear(b.rgb), m)), mix(a.a, b.a, m));
}
