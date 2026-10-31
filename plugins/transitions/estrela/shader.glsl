// Estrela de cinco pontas que gira e cresce até cobrir a tela. Forma por distância exata (Inigo Quilez), na
// proporção certa (o giro não deforma), com aceleração no crescimento e no giro, borda antisserrilhada e borrada
// pela velocidade, e sombra suave sobre o clipe atual.

/** Estrela de 5 pontas, raio externo r e razão interna rf; negativo = dentro. */
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float growth(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float px = 1.0 / resolution.y;
  const float rf = 0.5;
  // Raio externo que deixa os vales da estrela além dos cantos da tela, em qualquer ângulo.
  float halfDiag = 0.5 * length(vec2(ratio, 1.0));
  float rMax = (halfDiag + 0.03) / rf;
  float e = growth(progress);
  float speed = (growth(progress + 0.005) - growth(progress - 0.005)) / 0.01;
  float angle = spin * lmEaseInOutSine(progress);
  float d = sdStar5(lmRotate(p, angle), rMax * e, rf);
  // Rastro do movimento na borda: crescimento mais o giro (a ponta anda mais rápido que o vale).
  float soft = 1.5 * px + speed * halfDiag * 1.2 / 200.0 + spin * length(p) * 0.5 / 200.0 * lmBell(progress);
  float m = 1.0 - smoothstep(-soft, 0.0, d);

  float settle = 1.0 + 0.06 * (1.0 - e) * (1.0 - e);
  vec4 to = getToColor(0.5 + (uv - 0.5) / settle);
  vec4 from = getFromColor(0.5 + (uv - 0.5) / (1.0 + 0.03 * e));
  float env = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.85, 1.0, progress));
  from.rgb *= 1.0 - pow(1.0 - smoothstep(0.0, 0.09, d), 2.0) * 0.22 * env;
  return mix(from, to, m);
}
