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
// ---- Desfoque largo pelo mapa de níveis (mipmaps): suave, sem grade de amostras e quase de graça.
/** Média da imagem em volta, com raio ~ `radiusPx` px de 1080p (filtro em tenda de 9 leituras num nível). sRGB. */
vec3 mipBlur(vec2 uv, float radiusPx) {
  float px = max(radiusPx * resolution.y / 1080.0, 1.0);
  float level = max(log2(px) - 0.5, 0.0);
  vec2 t = exp2(level) / resolution;
  vec3 c = getColorLod(uv, level).rgb * 4.0;
  c += (getColorLod(uv + vec2(t.x, 0.0), level).rgb + getColorLod(uv - vec2(t.x, 0.0), level).rgb
    + getColorLod(uv + vec2(0.0, t.y), level).rgb + getColorLod(uv - vec2(0.0, t.y), level).rgb) * 2.0;
  c += getColorLod(uv + t, level).rgb + getColorLod(uv - t, level).rgb
    + getColorLod(uv + vec2(t.x, -t.y), level).rgb + getColorLod(uv + vec2(-t.x, t.y), level).rgb;
  return c / 16.0;
}

// Tirar a neblina: remove o véu de neblina e poluição (prior do canal escuro, He et al.). Numa imagem sem névoa,
// quase todo trecho tem algum canal perto do preto; onde nem o canal mais escuro chega lá, há névoa na frente. O
// canal escuro sai da mistura do pixel com a vizinhança (mapa de níveis: transmissão lisa, sem blocos nem halo
// duro), e a cena volta pela inversão do modelo de névoa, I = J·t + A·(1 − t), com "Cor da neblina" como A.
// "Clarear o escuro" abre as sombras pela claridade (Oklab), sem lavar a cor.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 A = max(hazeColor, vec3(0.2));
  vec3 n = c.rgb / A;
  vec3 nb = mipBlur(uv, 14.0) / A;
  float dark = mix(min(n.r, min(n.g, n.b)), min(nb.r, min(nb.g, nb.b)), 0.6);
  float t = clamp(1.0 - 0.82 * dark, 0.4, 1.0);
  vec3 col = clamp((c.rgb - hazeColor) / t + hazeColor, 0.0, 1.0);
  vec3 lab = toLab(col);
  lab.x = mix(lab.x, 1.0 - pow(1.0 - clamp(lab.x, 0.0, 1.0), 1.45), lift);
  lab.yz *= 1.04;
  return vec4(fromLab(lab), c.a);
}
