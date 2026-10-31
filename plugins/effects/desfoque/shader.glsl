// Desfoque gaussiano limpo em qualquer raio: 9×9 amostras espaçadas de 0,75 σ, lidas num nível de detalhe que já
// tem a média desse espaçamento (o mapa de níveis faz o pré-filtro). Assim não há cópias fantasmas da grade nem o
// chuvisco de amostras sorteadas, e o custo é o mesmo com raio 1 ou 30. A soma é feita em luz linear.
// Raio em px de um vídeo 1080p (σ = raio / 2, como antes).
vec4 effect(vec2 uv) {
  if (radius < 0.01) return getColor(uv);
  float sigma = 0.5 * radius * resolution.y / 1080.0;   // em pixels da tela
  float spacing = 0.75 * sigma;
  float lod = max(log2(spacing / 1.5), 0.0);
  vec2 step_ = vec2(spacing) / resolution;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int j = -4; j <= 4; j++) {
    for (int i = -4; i <= 4; i++) {
      vec2 o = vec2(float(i), float(j));
      float w = exp(-dot(o, o) * 0.28125);   // (0,75)² / 2: gaussiana de σ = 1 em unidades de σ
      vec4 s = getColorLod(uv + o * step_, lod);
      sum += vec4(lmToLinear(s.rgb), s.a) * w;
      total += w;
    }
  }
  sum /= total;
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
