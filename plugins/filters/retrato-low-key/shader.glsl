// ---- Cor em Oklab: L = claridade percebida (0 a 1), ab = cor. Matiz em graus: vermelho ~28, pele ~50,
// laranja ~55, dourado ~85, verde-amarelado ~120, verde ~140, ciano ~210, azul do céu ~250, magenta ~340.
vec3 toLab(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
/** Oklab → sRGB. O que sai da gama perde saturação (mesma luminância e matiz) em vez de virar outra cor. */
vec3 fromLab(vec3 lab) {
  vec3 c = lmFromOklab(vec3(max(lab.x, 0.0), lab.yz));
  float y = clamp(lmLuma(c), 0.0, 1.0);
  float lo = min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  float k = 1.0;
  if (lo < 0.0) k = min(k, y / max(y - lo, 1e-6));
  if (hi > 1.0) k = min(k, (1.0 - y) / max(hi - y, 1e-6));
  return lmToSrgb(mix(vec3(y), c, clamp(k, 0.0, 1.0)));
}
float hueDeg(vec3 lab) { return degrees(atan(lab.z, lab.y + 1e-7)); }
/** 1 no matiz `center` (graus), caindo até 0 a `width` graus; cores quase cinza não contam. */
float hueBand(vec3 lab, float center, float width) {
  float d = abs(mod(hueDeg(lab) - center + 540.0, 360.0) - 180.0);
  return (1.0 - smoothstep(width * 0.3, width, d)) * smoothstep(0.012, 0.045, length(lab.yz));
}
/** Peso de pele: matiz perto de 50°, croma moderado (laranja vivo não é pele), nem preto nem branco. */
float skinWeight(vec3 lab) {
  float d = abs(mod(hueDeg(lab) - 52.0 + 540.0, 360.0) - 180.0);
  float c = length(lab.yz);
  return (1.0 - smoothstep(12.0, 30.0, d)) * smoothstep(0.028, 0.055, c) * (1.0 - smoothstep(0.13, 0.19, c))
    * smoothstep(0.22, 0.38, lab.x) * (1.0 - smoothstep(0.93, 0.99, lab.x));
}
vec2 rotAB(vec2 ab, float deg) { float r = radians(deg); float s = sin(r), k = cos(r); return mat2(k, s, -s, k) * ab; }
/** Curva racional: inclinação s no fim (t = 1) e 1/s no começo; s = 1 não muda nada. */
float rcurve(float t, float s) { return t / ((s - 1.0) * (1.0 - t) + 1.0); }
/** Contraste em S em volta do pivô, sem cortar 0 nem 1 e sem esmagar os pretos (s = inclinação no pivô). */
float contrastL(float x, float s, float p) {
  x = clamp(x, 0.0, 1.0);
  return x < p ? p * rcurve(x / p, s) : 1.0 - (1.0 - p) * rcurve((1.0 - x) / (1.0 - p), s);
}
/** Pesos das faixas tonais em L (somam ~1): sombras, meios-tons, altas luzes. */
float wShadow(float L) { return 1.0 - smoothstep(0.08, 0.62, L); }
float wHigh(float L) { return smoothstep(0.42, 0.95, L); }
float wMid(float L) { return max(1.0 - wShadow(L) - wHigh(L), 0.0); }
/** Vibração em Oklab: realça o croma baixo mais que o alto; "skin" = quanto poupar a pele (0 a 1). */
vec3 vibranceLab(vec3 lab, float amount, float skin) {
  float c = length(lab.yz);
  float room = 1.0 - smoothstep(0.0, 0.2, c);
  float g = 1.0 + amount * room * room * (1.0 - skin * skinWeight(lab));
  lab.yz *= g;
  return lab;
}
/** Menor giro (graus, −180 a 180) para levar o matiz `from` até `to`. */
float hueDelta(float from, float to) { return mod(to - from + 540.0, 360.0) - 180.0; }
// ---- A pessoa (recorte da IA), com a borda alargada e suavizada para não aparecer recorte.
/** Recorte suavizado num raio de `radiusPx` px de 1080p (9 leituras); sem o recorte da IA devolve −1. */
float personSoft(vec2 uv, float radiusPx) {
  if (uHasPerson < 0.5) return -1.0;
  vec2 r = lmPxUv(radiusPx);
  float m = getPerson(uv) * 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    m += getPerson(uv + vec2(cos(a), sin(a)) * r);
  }
  return m / 10.0;
}
/** Onde está a pessoa (bordas suaves); sem o recorte da IA, vale a imagem toda. */
float personOrAll(vec2 uv) { float p = personSoft(uv, 4.0); return p < 0.0 ? 1.0 : p; }

// Retrato escuro (low-key): o fundo mergulha no preto e só o rosto fica na luz, com contraste de pintura. As
// sombras descem por uma curva (o que está na luz fica), a cor cai nas sombras; com o recorte da IA, o fundo
// escurece por inteiro (borda suavizada, sem recorte visível); a vinheta oval, de proporção certa, fica um pouco
// acima do centro, onde costuma estar o rosto.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = toLab(c.rgb);
  float lit = smoothstep(0.4, 0.85, lab.x);
  float deep = pow(clamp(lab.x, 0.0, 1.0), 1.0 + depth * 1.1);
  lab.x = mix(deep, lab.x, lit);
  lab.yz *= mix(0.7, 1.0, lit);
  float person = personSoft(uv, 10.0);
  if (person >= 0.0) {
    float bg = 1.0 - person;
    lab.x *= 1.0 - 0.75 * depth * bg;
    lab.yz *= 1.0 - 0.5 * depth * bg;
  }
  lab.yz += vec2(0.004, 0.01) * lit;
  lab.x = contrastL(lab.x, 1.15, 0.4);
  vec3 lin = lmToLinear(fromLab(lab));
  vec2 p = lmCentered(uv) - vec2(0.0, 0.05);
  float r = length(p * vec2(0.8, 1.0));
  lin *= mix(1.0, 1.0 - smoothstep(0.18, 0.8, r) * 0.88, vig);
  return vec4(lmToSrgb(lin), c.a);
}
