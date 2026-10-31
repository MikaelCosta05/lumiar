// Coração que cresce do centro até cobrir a tela. Forma por distância exata (Inigo Quilez), com a proporção
// certa, borda antisserrilhada e borrada pela velocidade, sombra suave e uma batida leve no meio do caminho.

float dot2(vec2 v) { return dot(v, v); }

/** Coração com a ponta em (0, 0) e o vão de cima em (0, 1); negativo = dentro. */
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

float growth(float t) {
  t = clamp(t, 0.0, 1.0);
  // Cresce com aceleração e dá uma "batida" (um pequeno pulso) quando chega ao meio.
  return lmEaseInOutCubic(t) * (1.0 + 0.05 * sin(clamp((t - 0.25) / 0.35, 0.0, 1.0) * PI));
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float px = 1.0 / resolution.y;
  // Tamanho final que cobre os quatro cantos (a ponta de baixo é o que mais demora a cobrir).
  float kMax = ((ratio + 1.0) * 0.5 + 0.04) / 0.55;
  float e = growth(progress);
  float k = max(kMax * e, 1e-4);
  float speed = abs(growth(progress + 0.005) - growth(progress - 0.005)) / 0.01 * kMax;
  // Coordenada do coração (centro visual dele no centro da tela); distância de volta em altura de tela.
  float d = sdHeart(p / k + vec2(0.0, 0.55)) * k;
  float soft = 1.5 * px + speed * 0.35 / 200.0;
  float m = 1.0 - smoothstep(-soft, 0.0, d);

  float settle = 1.0 + 0.06 * (1.0 - e) * (1.0 - e);
  vec4 to = getToColor(0.5 + (uv - 0.5) / settle);
  vec4 from = getFromColor(0.5 + (uv - 0.5) / (1.0 + 0.03 * e));
  float env = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.85, 1.0, progress));
  from.rgb *= 1.0 - pow(1.0 - smoothstep(0.0, 0.09, d), 2.0) * 0.22 * env;
  return mix(from, to, m);
}
