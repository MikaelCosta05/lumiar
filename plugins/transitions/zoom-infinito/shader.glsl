/**
 * O próximo clipe está "escondido" dentro do atual, num quadradinho 1/profundidade em volta do ponto.
 * A câmera mergulha até ele ocupar a tela inteira, e o ponto vai para o centro durante o caminho.
 */
vec4 frameAt(vec2 uv, float e) {
  vec2 point = vec2(ponto.x, 1.0 - ponto.y);
  float scale = pow(profundidade, e);
  vec2 view = mix(point, vec2(0.5), e);
  vec2 a = point + (uv - view) / scale;
  vec2 b = (a - point) * profundidade + 0.5;
  vec4 col = getFromColor(clamp(a, 0.0, 1.0));
  float edge = min(min(b.x, 1.0 - b.x), min(b.y, 1.0 - b.y));
  if (edge > 0.0) {
    // Entra aos poucos e com a borda suave: nunca aparece um retângulo recortado.
    float alpha = smoothstep(0.0, 0.3, edge) * smoothstep(0.4, 0.9, e);
    col = mix(col, getToColor(b), alpha);
  }
  return col;
}

vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  float speed = 6.0 * e * (1.0 - e);
  // Desfoque de movimento: média de instantes vizinhos do mergulho.
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    float k = float(i) / 7.0;
    sum += frameAt(uv, clamp(e - k * 0.03 * desfoque * speed, 0.0, 1.0));
  }
  return sum / 8.0;
}
