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

/**
 * Corretor secundário de uma faixa de cor (como o HSL de um editor, em Oklab): gira o matiz (graus), multiplica a
 * saturação e muda a luminosidade da faixa, com peso suave pelo matiz.
 */
vec3 adjustHue(vec3 lab, float centerDeg, float widthDeg, float shiftDeg, float sat, float light) {
  float w = hueBand(lab, centerDeg, widthDeg);
  float a = radians(shiftDeg) * w;
  float s = sin(a), k = cos(a);
  lab.yz = mat2(k, s, -s, k) * lab.yz;
  lab.yz *= mix(1.0, sat, w);
  lab.x += light * w * smoothstep(0.0, 0.08, length(lab.yz));
  return lab;
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

/** Preto e branco da cópia (densidade mínima e máxima): o preto vira "black" e o branco vira "white". sRGB. */
vec3 fade(vec3 col, vec3 black, vec3 white) { return black + (white - black) * col; }

vec3 planckXyz(float T) {
  float t = 1000.0 / T;
  float x = T < 4000.0 ? ((-0.2661239 * t - 0.2343589) * t + 0.8776956) * t + 0.179910 : ((-3.0258469 * t + 2.1070379) * t + 0.2226347) * t + 0.240390;
  float y = T < 2222.0 ? ((-1.1063814 * x - 1.34811020) * x + 2.18555832) * x - 0.20219683
    : T < 4000.0 ? ((-0.9549476 * x - 1.37418593) * x + 2.09137015) * x - 0.16748867
    : ((3.0817580 * x - 5.87338670) * x + 3.75112997) * x - 0.37001483;
  return vec3(x / y, 1.0, (1.0 - x - y) / y);
}
/**
 * Balanço de branco de verdade: adaptação cromática de Bradford do branco de 6504 K para o de uma luz de corpo negro
 * deslocada de "mired" (positivo = mais quente, negativo = mais frio; 30 mired ≈ um filtro 81A), mantendo a luminância
 * de cada pixel. Entrada e saída lineares.
 */
vec3 kelvin(vec3 lin, float mired) {
  const mat3 XYZ_TO_LMS = mat3(0.8951, -0.7502, 0.0389, 0.2664, 1.7135, -0.0685, -0.1614, 0.0367, 1.0296);
  const mat3 RGB_TO_LMS = mat3(0.4227253, 0.0556998, 0.0213826, 0.4913453, 0.9615341, 0.0876419, 0.0273579, 0.0231838, 0.9805081);
  const mat3 LMS_TO_RGB = mat3(2.5380445, -0.1460041, -0.0422985, -1.293277, 1.1166483, -0.0716072, -0.0402369, -0.022329, 1.0227527);
  float T = 1.0e6 / (1.0e6 / 6504.0 + mired);
  vec3 gain = (XYZ_TO_LMS * planckXyz(clamp(T, 1700.0, 24000.0))) / (XYZ_TO_LMS * planckXyz(6504.0));
  vec3 out_ = LMS_TO_RGB * (gain * (RGB_TO_LMS * lin));
  out_ *= lmLuma(lin) / max(lmLuma(out_), 1e-6);
  return fitGamut(out_);
}

/** Contraste em S suave pelo cinza médio de tela: 1 = igual, 1,5 = forte, 0,5 = lavado (preto levanta um pouco). */
vec3 toneContrast(vec3 lab, float contrast, float keepSat) {
  float k = contrast - 1.0;
  float black = max(-0.12 * k, 0.0), white = 1.0 - max(-0.05 * k, 0.0);
  return toneLab(lab, black, 0.25 - 0.14 * k, 0.5, 0.75 + 0.14 * k, white, keepSat);
}

/**
 * Kodak Vision3 500T copiado em 2383: negativo de cinema para luz de tungstênio. Curva de cópia em S com ombro longo
 * (os realces se desfazem macios), sombras ciano-azuladas, altas luzes quentes, vermelhos fundos, verdes puxados para
 * o ciano e pele natural. "Temperatura" é um balanço de branco de verdade (Bradford, ±45 mired), "Contraste" muda a
 * curva em volta do cinza médio e "Granulado" usa o grão de película da biblioteca.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = lmToOklab(kelvin(lmToLinear(c.rgb), temp * 45.0));
  lab = toneContrast(lab, contrast * 1.12, 0.6);
  float skin = skinMask(lab);
  lab = adjustHue(lab, 29.0, 24.0, 0.0, 1.1, -0.01);
  lab = adjustHue(lab, 140.0, 45.0, 8.0, 0.88, 0.0);
  lab = adjustHue(lab, 250.0, 50.0, -8.0, 0.95, 0.0);
  lab.yz *= mix(0.97, 1.0, skin);
  lab = splitTone(lab, vec2(-0.012, -0.012), vec2(0.0), vec2(0.006, 0.014));
  // Ombro da cópia: o branco nunca bate chapado no teto.
  vec3 col = lmSoftClip(fromLab(lab), 0.86);
  col = fade(col, vec3(0.012, 0.016, 0.02), vec3(0.985, 0.975, 0.955));
  col = lmFilmGrain(col, uv, grain * 0.55, 1.5, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
