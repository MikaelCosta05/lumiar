float pchipInner(float d0, float d1) { return d0 * d1 > 0.0 ? 2.0 * d0 * d1 / (d0 + d1) : 0.0; }
float pchipEnd(float d0, float d1) {
  float m = (3.0 * d0 - d1) * 0.5;
  if (m * d0 <= 0.0) return 0.0;
  if (d0 * d1 <= 0.0 && abs(m) > abs(3.0 * d0)) return 3.0 * d0;
  return m;
}
/**
 * Curva de tons por 5 pontos (entrada 0, ¼, ½, ¾ e 1 → saídas y0…y4), como a curva de um corretor de cor:
 * Hermite monótona (Fritsch–Butland), contínua e sem quinas, nunca "volta para trás". Fora de 0 a 1, segue reta.
 */
float curve5(float x, float y0, float y1, float y2, float y3, float y4) {
  float d0 = (y1 - y0) * 4.0, d1 = (y2 - y1) * 4.0, d2 = (y3 - y2) * 4.0, d3 = (y4 - y3) * 4.0;
  float m0 = pchipEnd(d0, d1), m1 = pchipInner(d0, d1), m2 = pchipInner(d1, d2), m3 = pchipInner(d2, d3), m4 = pchipEnd(d3, d2);
  float xs = clamp(x, 0.0, 1.0) * 4.0;
  float i = min(floor(xs), 3.0);
  float t = xs - i;
  float ya = y0, yb = y1, ma = m0, mb = m1;
  if (i > 2.5) { ya = y3; yb = y4; ma = m3; mb = m4; }
  else if (i > 1.5) { ya = y2; yb = y3; ma = m2; mb = m3; }
  else if (i > 0.5) { ya = y1; yb = y2; ma = m1; mb = m2; }
  float t2 = t * t, t3 = t2 * t;
  float y = (2.0 * t3 - 3.0 * t2 + 1.0) * ya + (t3 - 2.0 * t2 + t) * ma * 0.25 + (3.0 * t2 - 2.0 * t3) * yb + (t3 - t2) * mb * 0.25;
  return y + min(x, 0.0) * m0 + max(x - 1.0, 0.0) * m4;
}

/** A mesma curva, um conjunto de pontos por canal (curvas R, G e B). */
vec3 curve5v(vec3 x, vec3 y0, vec3 y1, vec3 y2, vec3 y3, vec3 y4) {
  return vec3(curve5(x.r, y0.r, y1.r, y2.r, y3.r, y4.r), curve5(x.g, y0.g, y1.g, y2.g, y3.g, y4.g), curve5(x.b, y0.b, y1.b, y2.b, y3.b, y4.b));
}

/**
 * Redscale (filme colocado ao contrário: a luz entra pela base e passa primeiro pela camada do vermelho): o azul
 * quase não é registrado e a imagem vira um degradê contínuo de vermelho-escuro, laranja e amarelo queimado
 * ("Amarelo nas luzes" leva as luzes até o amarelo-claro). Curvas suaves por canal (sem quinas), um resto da cor
 * original, grão e vinheta.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  float l = clamp(dot(c.rgb, vec3(0.45, 0.45, 0.1)), 0.0, 1.0);
  float y = yellow;
  vec3 col = curve5v(vec3(l), vec3(0.06, 0.01, 0.01), vec3(0.36, 0.05, 0.02), vec3(0.72, 0.21, 0.05),
    vec3(0.92, mix(0.45, 0.6, y), 0.12 + 0.1 * y), vec3(1.0, mix(0.68, 0.92, y), mix(0.28, 0.58, y)));
  col += (c.rgb - vec3(lmLuma(c.rgb))) * vec3(0.18, 0.1, 0.04);
  vec3 lin = lmToLinear(clamp(col, 0.0, 1.0)) * lmVignette(uv, 0.3, 0.5);
  col = lmFilmGrain(lmToSrgb(lin), uv, grain * 0.6, 1.6, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
