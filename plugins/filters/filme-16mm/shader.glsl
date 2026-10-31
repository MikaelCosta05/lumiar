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

/**
 * Curva de tons na luminosidade Oklab, com os pontos em valores de tela (sRGB 0, ¼, ½, ¾, 1): muda o contraste
 * sem mudar o matiz. "keepSat" 0 = mantém o croma, 1 = mantém a saturação (croma acompanha a luminosidade).
 */
vec3 toneLab(vec3 lab, float y0, float y1, float y2, float y3, float y4, float keepSat) {
  float L = max(lab.x, 0.0);
  float v = lmToSrgb(vec3(L * L * L)).x;
  float v2 = curve5(v, y0, y1, y2, y3, y4);
  float L2 = pow(max(lmToLinear(vec3(max(v2, 0.0))).x, 0.0), 1.0 / 3.0);
  lab.yz *= mix(1.0, L2 / max(L, 1e-4), keepSat);
  lab.x = L2;
  return lab;
}

/** Pesos de sombras, meios-tons e altas luzes pela luminosidade Oklab (somam ~1; o preto puro fica neutro). */
vec3 toneWeights(float L) {
  float sh = smoothstep(0.0, 0.22, L) * (1.0 - smoothstep(0.25, 0.65, L));
  float hi = smoothstep(0.55, 0.92, L);
  return vec3(sh, max(1.0 - sh - hi, 0.0) * smoothstep(0.0, 0.3, L), hi);
}

/** Tinge sombras, meios-tons e altas luzes (deslocamentos a/b de Oklab), como as rodas de cor de um corretor. */
vec3 splitTone(vec3 lab, vec2 shadows, vec2 mids, vec2 highlights) {
  vec3 w = toneWeights(lab.x);
  lab.yz += shadows * w.x + mids * w.y + highlights * w.z;
  return lab;
}

/** Preto e branco da cópia (densidade mínima e máxima): o preto vira "black" e o branco vira "white". sRGB. */
vec3 fade(vec3 col, vec3 black, vec3 white) { return black + (white - black) * col; }

/** Dança da película na janela do projetor: um deslocamento novo a cada quadro do filme, ligado ao anterior. uv. */
vec2 gateWeave(float fps, float amountPx) {
  float f = floor(time * fps);
  vec2 slow = vec2(lmNoise(vec2(f * 0.23, 3.7)), lmNoise(vec2(11.3, f * 0.19)));
  vec2 jitter = lmHash2(vec2(f, 9.1)) * 2.0 - 1.0;
  return (slow * 0.8 + jitter * 0.25) * lmPxUv(amountPx) * vec2(0.55, 1.0);
}

/** Oscilação de exposição de projetor/obturador: fator perto de 1, novo a cada quadro do filme. */
float flicker(float fps, float amount) {
  float f = floor(time * fps);
  return 1.0 + amount * (lmNoise(vec2(f * 0.41, 1.7)) * 0.7 + (lmHash(vec2(f, 4.2)) - 0.5) * 0.6);
}

/**
 * Maciez de lente/película barata: média em luz linear de 4 leituras bilineares em X (cada uma já mistura 2×2
 * pixels), raio em px de 1080p. Determinística e barata (o grão vem por cima e esconde o resto).
 */
vec3 filmSoft(vec2 uv, float radiusPx) {
  vec2 o = lmPxUv(radiusPx) * 0.5;
  return (lmToLinear(getColor(uv + vec2(o.x, o.y)).rgb) + lmToLinear(getColor(uv + vec2(-o.x, o.y)).rgb)
    + lmToLinear(getColor(uv + vec2(o.x, -o.y)).rgb) + lmToLinear(getColor(uv - o).rgb)) * 0.25;
}

/**
 * Filme 16 mm de documentário: a película dança um pouco na janela do projetor a cada quadro de 24 fps ("Tremor",
 * com uma pequena ampliação para a borda nunca aparecer), imagem um pouco macia, cor desbotada com sombras
 * esverdeadas e luzes quentes, oscilação de exposição de quadro a quadro, vinheta e grão grosso de película.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  float amountPx = 6.0 * weave;
  vec2 q = 0.5 + (uv - 0.5) * (1.0 - 2.0 * lmPx(amountPx * 1.4)) + gateWeave(24.0, amountPx);
  vec3 lin = filmSoft(q, 1.6);
  vec3 lab = lmToOklab(lin);
  lab = toneLab(lab, 0.0, 0.235, 0.5, 0.77, 0.965, 0.6);
  lab.yz *= 0.8;
  lab = splitTone(lab, vec2(-0.006, 0.002), vec2(0.0, 0.004), vec2(0.004, 0.014));
  lin = fitGamut(lmFromOklab(lab)) * flicker(24.0, 0.035) * lmVignette(uv, 0.35, 0.3);
  vec3 col = fade(lmToSrgb(lin), vec3(0.045, 0.05, 0.045), vec3(0.97, 0.96, 0.93));
  col = lmFilmGrain(col, uv, grain * 0.85, 2.3, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
