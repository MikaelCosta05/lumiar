// Espiral: o próximo clipe é revelado ao longo de uma faixa em espiral (arquimediana) que se desenrola do centro
// para fora, com aceleração. Cada ponto tem a sua posição ao longo da faixa (volta + ângulo), contínua quando o
// ângulo dá a volta: não há emenda. A ponta da faixa tem borda suave ("Suavidade"); a linha da espiral entre uma
// volta e a seguinte é antisserrilhada (8 pontos por pixel). O próximo clipe entra girando e assentando, com
// espelho nas bordas.

vec2 mirrorUv(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

float spiralMask(vec2 p, float e) {
  float a = fract(atan(p.y, p.x) / (2.0 * PI) + 1.0);
  float r = length(p) / (0.5 * length(vec2(ratio, 1.0)));
  // Volta da faixa em que o ponto está (a linha da espiral passa em r·voltas = ângulo + n): n + a cresce sem
  // saltos quando o ângulo passa de 1 para 0, porque n sobe 1 ao mesmo tempo.
  float n = floor(r * turns - a);
  float v = (n + a + 1.0) / (turns + 1.0);
  return 1.0 - smoothstep(e - smoothness, e, v);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float ease = lmEaseInOutCubic(progress);
  float e = ease * (1.0 + smoothness);
  float px = 1.0 / resolution.y;
  float m = 0.0;
  for (int i = 0; i < 8; i++) {
    // Pontos numa espiral áurea dentro do pixel.
    float rr = sqrt((float(i) + 0.5) / 8.0) * 0.5;
    float aa = float(i) * 2.39996323;
    m += spiralMask(p + vec2(cos(aa), sin(aa)) * rr * px, e);
  }
  m /= 8.0;
  // O próximo clipe chega girando e com zoom, e assenta no fim.
  float rest = 1.0 - ease;
  vec2 q = lmRotate(p, -rest * rest * 0.9) / (1.0 + 0.25 * rest * rest);
  vec4 to = getToColor(mirrorUv(lmUncentered(q)));
  return mix(getFromColor(uv), to, m);
}
