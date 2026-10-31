const float TAU = 6.28318530718;

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

/** Peso suave (0 a 1) de uma faixa de matiz Oklab: centro e meia-largura em graus. Some nas cores quase neutras. */
float hueBand(vec3 lab, float centerDeg, float widthDeg) {
  float c = length(lab.yz);
  if (c < 1e-5) return 0.0;
  float d = abs(mod(atan(lab.z, lab.y) - radians(centerDeg) + PI, TAU) - PI);
  return (1.0 - smoothstep(0.0, radians(widthDeg), d)) * smoothstep(0.004, 0.03, c);
}

/** Onde a cor parece pele (matiz Oklab perto de 50°, croma moderado, não muito escura): 0 a 1. */
float skinMask(vec3 lab) {
  float c = length(lab.yz);
  return hueBand(lab, 52.0, 32.0) * smoothstep(0.012, 0.035, c) * (1.0 - smoothstep(0.13, 0.2, c)) * smoothstep(0.25, 0.42, lab.x);
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

/**
 * Puxa os matizes vizinhos de "targetDeg" na direção dele ("strength" 0 a ~0,6; o mapeamento continua monótono,
 * sem inverter cores) e multiplica a saturação da faixa: é assim que se faz teal & orange sem pintar tudo.
 */
vec3 pullHue(vec3 lab, float targetDeg, float widthDeg, float strength, float sat) {
  float c = length(lab.yz);
  if (c < 1e-5) return lab;
  float h = atan(lab.z, lab.y);
  float d = mod(radians(targetDeg) - h + PI, TAU) - PI;
  float w = (1.0 - smoothstep(0.0, radians(widthDeg), abs(d))) * smoothstep(0.004, 0.03, c);
  float h2 = h + d * strength * w;
  float c2 = c * mix(1.0, sat, w);
  return vec3(lab.x, c2 * cos(h2), c2 * sin(h2));
}

/**
 * Teal & orange natural: sombras e fundo verde-azulados (matizes frios puxados para o teal), altas luzes quentes e a
 * pele protegida por uma máscara de matiz em Oklab, então o contraste de cor do cinema não deixa ninguém laranja.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = toLab(c.rgb);
  lab = toneLab(lab, 0.0, 0.22, 0.5, 0.785, 0.99, 0.6);
  float skin = skinMask(lab) * skinKeep;
  lab = pullHue(lab, 205.0, 60.0, 0.35 * shadowAmt, 1.0 + 0.1 * shadowAmt);
  vec2 sh = vec2(-0.03, -0.02) * shadowAmt * (1.0 - skin);
  vec2 mid = vec2(-0.012, -0.008) * shadowAmt * (1.0 - skin);
  vec2 hi = vec2(0.01, 0.024) * lightAmt * (1.0 - 0.5 * skin);
  lab = splitTone(lab, sh, mid, hi);
  lab.yz *= 1.03;
  return vec4(clamp(fromLab(lab), 0.0, 1.0), c.a);
}
