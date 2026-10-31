// Blocos quadrados (quadrados de verdade na tela) que trocam em ordem aleatória, com uma leve onda na
// diagonal: cada bloco nasce do centro da célula girando de 45° a 0°, com cantos que se fecham, e cresce com
// aceleração até cobrir a célula. "Suavidade" = quanto do tempo cada bloco leva para crescer.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 g = lmCentered(uv) * size;
  vec2 cell = floor(g);
  vec2 local = g - cell - 0.5;
  // Ordem: acaso por bloco com um pouco de varredura diagonal (da esquerda de cima para a direita de baixo).
  vec2 c = (cell + 0.5) / size / vec2(ratio, 1.0);  // −0,5 a 0,5
  float sweep = clamp(0.5 + (c.x - c.y) * 0.5, 0.0, 1.0);
  float r = mix(lmHash(cell + 0.37), sweep, 0.3);
  float sm = max(smoothness, 0.04);
  float t = clamp((progress * (1.0 + sm) - r) / sm, 0.0, 1.0);
  float e = lmEaseOutCubic(t);
  // O quadrado ainda girado só cobre a célula com meia largura 0,5·(cos θ + sen θ): o tamanho final leva o giro
  // em conta, senão sobram frestas finas do clipe atual nas bordas da célula (parecem molduras).
  float theta = (1.0 - e) * 0.785398;
  float half_ = mix(-0.04, 0.5 * (cos(theta) + sin(theta)) + 0.03, e);
  vec2 q = lmRotate(local, theta);
  float corner = 0.35 * (1.0 - e) * max(half_, 0.0);
  float sd = lmSdRoundBox(q, vec2(max(half_, 0.0)), corner) - min(half_, 0.0);
  float aa = size / resolution.y;
  float m = clamp(0.5 - sd / (1.5 * aa), 0.0, 1.0);
  return mix(getFromColor(uv), getToColor(uv), m);
}
