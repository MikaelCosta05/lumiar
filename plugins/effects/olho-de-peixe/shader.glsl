// Olho de peixe: lente que estufa o centro (ou afunila, com valor negativo).
// Com valor negativo (almofada) a lente precisaria de imagem de fora do quadro nas bordas: a imagem é ampliada só o
// necessário para que o meio de cada borda caia exatamente na borda, então nunca aparece a faixa esticada.
float lens(vec2 p, float maxR2) { return 1.0 - strength * 0.5 * (1.0 - dot(p, p) / maxR2); }

vec4 effect(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float maxR2 = dot(aspect * 0.5, aspect * 0.5);
  float norm = 1.0;
  if (strength < 0.0) norm = max(lens(vec2(ratio * 0.5, 0.0), maxR2), lens(vec2(0.0, 0.5), maxR2));
  p *= lens(p, maxR2) / norm;
  return getColor(p / aspect + 0.5);
}
