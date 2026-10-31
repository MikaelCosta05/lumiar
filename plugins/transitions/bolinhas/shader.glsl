// Grade de bolinhas (redondas na tela, com a proporção certa) que crescem do centro para as bordas: cada
// bolinha tem seu atraso pela distância ao centro e cresce com aceleração. Borda por distância, sem serrilhado,
// e cada pixel consulta as bolinhas vizinhas, para as que já passaram do tamanho da célula se fundirem.

float dotRadius(vec2 cell) {
  vec2 c = (cell + 0.5) / dots;  // centro da bolinha, em altura de tela, a partir do centro
  float far = 0.5 * length(vec2(ratio, 1.0));
  float delay = 0.45 * clamp(length(c) / far, 0.0, 1.0);
  float t = clamp((progress - delay) / 0.55, 0.0, 1.0);
  // De um pouco abaixo de zero (nada aparece no começo) até cobrir o canto da célula.
  return mix(-0.05, 0.78, lmEaseInOutCubic(t));
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 g = lmCentered(uv) * dots - 0.5;  // célula 0 com a bolinha no centro da tela
  vec2 cell = floor(g + 0.5);
  vec2 local = g - cell;
  float aa = dots / resolution.y;  // um pixel, em células
  float m = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      float sd = length(local - o) - dotRadius(cell + o);
      m = max(m, clamp(0.5 - sd / (1.5 * aa), 0.0, 1.0));
    }
  }
  return mix(getFromColor(uv), getToColor(uv), m);
}
