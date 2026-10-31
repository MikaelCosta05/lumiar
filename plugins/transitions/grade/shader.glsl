// Azulejos: cada quadrado vira como uma placa em perspectiva (gira no próprio eixo vertical), da esquerda
// para a direita com um pouco de acaso, cada um com aceleração. A frente é o clipe atual e o verso o próximo,
// com luz que muda com o ângulo, borda antisserrilhada e sombra no vão atrás da placa.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 grid = vec2(max(floor(size * ratio + 0.5), 1.0), size);
  vec2 cell = min(floor(uv * grid), grid - 1.0);
  vec2 local = uv * grid - cell - 0.5;  // −0,5 a 0,5 dentro do azulejo
  float delay = (cell.x / max(grid.x - 1.0, 1.0)) * 0.5 + lmHash(cell + 0.71) * 0.2;
  float t = clamp((progress - delay) / 0.3, 0.0, 1.0);
  if (t <= 0.0) return getFromColor(uv);
  if (t >= 1.0) return getToColor(uv);
  float e = lmEaseInOutCubic(t);
  float angle = e * PI;
  float c = cos(angle), s = sin(angle);
  // Coordenadas na proporção da tela (o azulejo é quase quadrado) e um leve recuo enquanto gira.
  vec2 tileAspect = vec2(ratio / grid.x, 1.0 / grid.y);
  vec2 x = local * tileAspect;
  float lift = 1.0 - 0.15 * s;
  x /= lift;
  // Raio da câmera (a 4 azulejos de distância) até a placa girada: resolve u (largura) e v (altura).
  float D = 4.0 * tileAspect.y;
  float den = c * D - x.x * s;
  vec2 halfSize = 0.5 * tileAspect;
  // O vão atrás da placa: o fundo bem escuro (na sombra dela), mais escuro no meio, onde a placa está de lado.
  vec4 back = mix(getFromColor(uv), getToColor(uv), e);
  // Logo no começo e no fim do giro o vão quase não escurece (a borda da placa ainda encosta na vizinha).
  back.rgb *= mix(1.0, 0.16 * (1.0 - 0.6 * s * (1.0 - smoothstep(0.0, 0.6, length(local)))), smoothstep(0.12, 0.6, s));
  if (abs(den) < 1e-5) return back;
  float u = x.x * D / den;
  float z = u * s;
  float v = x.y * (D + z) / D;
  vec2 q = vec2(u, v);
  if (D + z <= 0.0) return back;
  bool front = c > 0.0;
  vec2 src = front ? q : vec2(-q.x, q.y);
  vec2 suv = (cell + 0.5 + src / tileAspect) / grid;
  vec4 col = front ? getFromColor(suv) : getToColor(suv);
  // Luz: a placa escurece de lado e ganha um brilho quando passa de frente para a luz.
  float facing = abs(c);
  col.rgb *= mix(0.5, 1.0, pow(facing, 0.7)) + 0.15 * s * s * (0.5 + 0.5 * u / halfSize.x * sign(c));
  // Borda antisserrilhada, medida em pixels da tela.
  float sd = lmSdBox(q, halfSize);
  float pxScale = (1.0 / resolution.y) / lift * D / max(D + z, 1e-4) / max(facing, 0.05);
  float cover = clamp(0.5 - sd / (1.5 * min(pxScale, 0.5 * halfSize.y)), 0.0, 1.0);
  return mix(back, col, cover);
}
