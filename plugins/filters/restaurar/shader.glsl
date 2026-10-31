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
// ---- Pele: filtro bilateral (respeita bordas) + separação de frequências (os poros voltam).
/**
 * Média das cores em volta (Oklab), com peso que cai com a distância e com a diferença de claridade e cor:
 * alisa manchas e textura irregular, mas não atravessa bordas (olhos, boca, cabelo, contorno do rosto).
 * Raio em px de 1080p; `count` amostras (até 32) numa espiral áurea fixa (sem chuvisco de quadro a quadro).
 */
vec3 bilateralLab(vec2 uv, vec3 center, float radiusPx, float sigmaL, float sigmaC, int count) {
  vec3 sum = center;
  float wsum = 1.0;
  vec2 scale = lmPxUv(radiusPx);
  float iL = 0.5 / (sigmaL * sigmaL);
  float iC = 0.5 / (sigmaC * sigmaC);
  float n = float(count);
  for (int i = 0; i < 32; i++) {
    if (i >= count) break;
    float r = sqrt((float(i) + 0.5) / n);
    float a = float(i) * 2.39996323;
    vec3 s = toLab(getColor(uv + vec2(cos(a), sin(a)) * r * scale).rgb);
    vec3 d = s - center;
    float w = exp(-2.0 * r * r - d.x * d.x * iL - dot(d.yz, d.yz) * iC);
    sum += s * w;
    wsum += w;
  }
  return sum / wsum;
}
/** Média de 1 px de 1080p em volta (4 leituras entre os pixels): o que sobra de center − isto são os poros. */
vec3 tinyBlurLab(vec2 uv) {
  vec2 p = lmPxUv(0.75);
  return toLab((getColor(uv + vec2(p.x, p.y)).rgb + getColor(uv + vec2(-p.x, p.y)).rgb
    + getColor(uv + vec2(p.x, -p.y)).rgb + getColor(uv + vec2(-p.x, -p.y)).rgb) * 0.25);
}
// ---- Detalhe: desfoques determinísticos (espiral fixa, sem chuvisco) e o anel de vizinhos para conter halos.
/** Claridade (Oklab L) média num disco gaussiano de raio `radiusPx` px de 1080p (16 leituras fixas). */
float blurL(vec2 uv, float radiusPx) {
  vec2 scale = lmPxUv(radiusPx);
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    float r = sqrt((float(i) + 0.5) / 16.0);
    float a = float(i) * 2.39996323;
    float w = exp(-3.0 * r * r);
    sum += toLab(getColor(uv + vec2(cos(a), sin(a)) * r * scale).rgb).x * w;
    wsum += w;
  }
  return sum / wsum;
}
/** Menor e maior claridade num anel de 8 vizinhos a `radiusPx` px (para limitar o exagero da nitidez). */
vec2 rangeL(vec2 uv, float centerL, float radiusPx) {
  vec2 r = lmPxUv(radiusPx);
  vec2 mm = vec2(centerL);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    float l = toLab(getColor(uv + vec2(cos(a), sin(a)) * r).rgb).x;
    mm = vec2(min(mm.x, l), max(mm.y, l));
  }
  return mm;
}
/** Diferença de detalhe sem o ruído fino (abaixo de `floor_` não realça) e com o excesso comprimido. */
float detail(float d, float floor_, float knee) {
  float m = max(abs(d) - floor_, 0.0);
  return sign(d) * m / (1.0 + m / knee);
}

// Restaurar: tira ruído, recupera contornos e cor de vídeo antigo. 1) Redução de ruído por filtro bilateral em
// Oklab, mais forte na cor (o ruído colorido do vídeo antigo) que na claridade, sem borrar bordas. 2) Contornos:
// nitidez de ~2 px de 1080p só na claridade, presa entre os vizinhos (sem halo). 3) Cor: contraste leve e vibração
// com a pele poupada.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = toLab(c.rgb);
  vec3 clean = bilateralLab(uv, lab, 3.0, 0.035, 0.08, 18);
  // A cor do ruído sai quase toda; a claridade só o tanto que não apaga textura.
  vec3 den = vec3(mix(lab.x, clean.x, 0.75), clean.yz);
  float wide = blurL(uv, 2.5);
  vec2 mm = rangeL(uv, den.x, 1.5);
  float L = den.x + detail(den.x - wide, 0.01, 0.08) * 0.8;
  L = clamp(L, mm.x - 0.015, mm.y + 0.015);
  L = contrastL(L, 1.1, 0.45);
  lab = vibranceLab(vec3(L, den.yz), 0.35, 0.7);
  return vec4(fromLab(lab), c.a);
}
