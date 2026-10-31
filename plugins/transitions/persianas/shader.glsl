// Persianas: cada faixa abre com o seu atraso (uma depois da outra) e com aceleração, a borda suavizada
// (no mínimo um pixel) e borrada pela velocidade, e uma sombra leve à frente da borda que passa, como uma lâmina
// que vira. "Vertical" = faixas deitadas (a tela se divide de cima para baixo).

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  bool horizontalBands = vertical > 0.5;
  float coord = horizontalBands ? 1.0 - uv.y : uv.x;
  float n = max(floor(count + 0.5), 1.0);
  float band = min(floor(coord * n), n - 1.0);
  float f = coord * n - band;
  // Atraso escalonado: a primeira faixa sai na frente e a última termina no fim.
  float delay = n > 1.0 ? band / (n - 1.0) * 0.35 : 0.0;
  float t = clamp((progress - delay) / 0.65, 0.0, 1.0);
  float e = lmEaseInOutCubic(t);
  float speed = (lmEaseInOutCubic(clamp(t + 0.01, 0.0, 1.0)) - lmEaseInOutCubic(clamp(t - 0.01, 0.0, 1.0))) / 0.02 / 0.65;
  float pxBand = n / (horizontalBands ? resolution.y : resolution.x);  // um pixel, em largura de faixa
  float soft = max(smoothness, 1.5 * pxBand) + speed / 200.0;
  float edge = e * (1.0 + soft);
  float m = 1.0 - smoothstep(edge - soft, edge, f);
  vec4 from = getFromColor(uv);
  // Sombra que a lâmina projeta à frente dela, só enquanto ela anda.
  float shadow = pow(1.0 - smoothstep(edge, edge + 0.35, f), 2.0) * 0.3 * lmBell(t);
  from.rgb *= 1.0 - shadow;
  return mix(from, getToColor(uv), m);
}
