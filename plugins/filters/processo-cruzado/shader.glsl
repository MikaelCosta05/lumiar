/**
 * Traz a cor de volta para dentro do sRGB sem mudar a luminância nem o matiz: em vez de cortar cada canal
 * (o que muda a cor e faz quinas), puxa a cor para o cinza de mesma luminância, com um joelho suave.
 * Entrada e saída em luz linear.
 */
vec3 fitGamut(vec3 lin) {
  float y = clamp(lmLuma(lin), 0.0, 1.0);
  vec3 d = lin - y;
  float hi = max(d.r, max(d.g, d.b));
  float lo = min(d.r, min(d.g, d.b));
  // Quanto do caminho até a borda do gamut a cor já usa (1 = na borda).
  float e = max(max(hi, 0.0) / max(1.0 - y, 1e-5), max(-lo, 0.0) / max(y, 1e-5));
  const float knee = 0.9;
  float f = e <= knee ? e : knee + (1.0 - knee) * (1.0 - exp(-(e - knee) / (1.0 - knee)));
  return y + d * (f / max(e, 1e-5));
}

/** sRGB → Oklab (cor perceptual: L = luminosidade, a/b = cor). */
vec3 toLab(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }

/** Oklab → sRGB, já dentro do gamut. */
vec3 fromLab(vec3 lab) { return lmToSrgb(fitGamut(lmFromOklab(lab))); }

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
 * Processo cruzado (slide E-6 revelado em C-41): curvas por canal suaves (sem quinas): o vermelho ganha contraste, o
 * verde sobe nos meios-tons e o azul é comprimido (preto azulado, branco amarelado), dando o amarelo-esverdeado nas
 * luzes e o azul nas sombras; saturação um pouco maior, com o gamut tratado sem cortar canais.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = curve5v(c.rgb, vec3(0.0, 0.02, 0.17), vec3(0.17, 0.24, 0.31), vec3(0.52, 0.56, 0.47), vec3(0.86, 0.84, 0.64), vec3(1.0, 0.98, 0.8));
  vec3 lab = toLab(clamp(col, 0.0, 1.0));
  lab.yz *= 1.12;
  return vec4(clamp(fromLab(lab), 0.0, 1.0), c.a);
}
