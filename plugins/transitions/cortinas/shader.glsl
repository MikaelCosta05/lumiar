// Cortinas de teatro: duas cortinas de veludo fecham com aceleração (a barra de baixo atrasa um pouco enquanto
// elas correm), ficam fechadas um instante, a troca acontece escondida atrás delas e elas abrem no próximo
// clipe. O tecido tem pregas que se apertam quando a cortina está recolhida, luz de cima com o brilho de
// veludo nas cristas, barra escura na beirada e sombra da cortina sobre a imagem.

float closeOf(float t) {
  return lmEaseInOutCubic(clamp(t / 0.45, 0.0, 1.0)) * (1.0 - lmEaseInOutCubic(clamp((t - 0.55) / 0.45, 0.0, 1.0)));
}

/** Cor de uma cortina num ponto: "d" = distância da borda de fora da tela (0 a 1), "edge" = onde ela termina. */
vec3 velvet(float d, float edge, float y, float periodPx) {
  float u = d / max(edge, 1e-4);  // 0 na borda de fora, 1 na beirada
  const float folds = 9.0;
  float phase = (u * folds + 0.18 * sin(y * 3.1 + u * 5.0)) * 2.0 * PI;
  // Pregas: menos contraste quando ficam finas demais na tela (evita serrilhado).
  float k = smoothstep(3.0, 9.0, periodPx);
  float facing = 0.5 + 0.5 * cos(phase + 0.6);
  float shade = mix(0.55, 0.22 + 0.9 * pow(facing, 1.3), k);
  float sheen = pow(1.0 - abs(cos(phase + 0.6)), 6.0) * 0.18 * k;
  vec3 base = lmToLinear(tint);
  vec3 lin = base * shade + base * sheen * 2.0 + vec3(sheen * 0.05);
  // Luz do palco: mais clara no alto, mais escura embaixo; barra escura na beirada.
  lin *= mix(0.55, 1.05, smoothstep(0.0, 1.0, y));
  lin *= 1.0 - 0.45 * smoothstep(0.985, 1.0, u);
  return lmToSrgb(lin);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float e = closeOf(progress);
  float speed = abs(closeOf(progress + 0.005) - closeOf(progress - 0.005)) / 0.01;
  // Beirada: passa um pouco do meio quando fecha (as duas se sobrepõem) e atrasa embaixo quando corre.
  float lag = 0.035 * speed * (1.0 - uv.y) * (1.0 - uv.y);
  float edge = max(e * 0.512 - lag, 0.0);
  float pxX = 1.0 / resolution.x;
  float periodPx = edge * resolution.x / 9.0;

  vec4 img = progress < 0.5 ? getFromColor(uv) : getToColor(uv);
  vec3 col = img.rgb;
  // Sombra das duas cortinas sobre a imagem.
  float dl = uv.x - edge;
  float dr = (1.0 - uv.x) - edge;
  float gapD = min(dl, dr);
  col *= 1.0 - 0.55 * exp(-max(gapD, 0.0) * ratio / 0.035) * smoothstep(0.0, 0.05, e);
  // Cortina da esquerda e da direita (a da direita espelhada).
  float covL = clamp(0.5 - dl / (1.5 * pxX), 0.0, 1.0) * step(1e-4, edge);
  float covR = clamp(0.5 - dr / (1.5 * pxX), 0.0, 1.0) * step(1e-4, edge);
  if (covL > 0.0) col = mix(col, velvet(uv.x, edge, uv.y, periodPx), covL);
  if (covR > 0.0) col = mix(col, velvet(1.0 - uv.x, edge, uv.y, periodPx), covR);
  return vec4(col, max(img.a, max(covL, covR)));
}
