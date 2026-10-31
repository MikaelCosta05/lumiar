// Ouro: a imagem em tons de ouro polido, com brilho nas luzes.
// - Degradê contínuo em Oklab: castanho quase preto nas sombras, bronze, ouro e um ouro-pálido nas luzes (o
//   reflexo do metal), sem degraus e com a claridade sempre subindo. Luminância em luz linear e S de contraste.
// - Brilho de luxo: as altas luzes espalham um halo dourado (níveis de detalhe, sem cópias), somado como luz e
//   com o ombro comprimido: brilha sem estourar em branco chapado.

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

bool inGamut(vec3 lin) { return all(greaterThanEqual(lin, vec3(-1e-4))) && all(lessThanEqual(lin, vec3(1.0001))); }
/** Oklab → sRGB reduzindo só o croma até caber na tela (claridade e matiz ficam). */
vec3 okToSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  if (inGamut(lmFromOklab(lab))) return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    if (inGamut(lmFromOklab(vec3(lab.x, lab.yz * m)))) lo = m; else hi = m;
  }
  return clamp(lmToSrgb(lmFromOklab(vec3(lab.x, lab.yz * lo))), 0.0, 1.0);
}
vec3 okOf(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
/** Degradê contínuo por 4 cores (Bézier cúbica em Oklab: sem quinas, sem degraus, claridade sempre subindo). */
vec3 gradient4(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  t = clamp(t, 0.0, 1.0);
  float u = 1.0 - t;
  return okToSrgb(u * u * u * okOf(c0) + 3.0 * u * u * t * okOf(c1) + 3.0 * u * t * t * okOf(c2) + t * t * t * okOf(c3));
}
/** Luminância medida em luz linear (Rec.709), devolvida em sRGB. */
float lum(vec3 c) { return lmToSrgb(vec3(lmLuma(lmToLinear(c)))).x; }

vec4 applyFilter(vec4 c, vec2 uv) {
  float t = paperCurve(lum(c.rgb), 3.4, 0.47);
  vec3 col = gradient4(t, vec3(0.07, 0.035, 0.0), vec3(0.5, 0.29, 0.06), vec3(0.98, 0.76, 0.3), vec3(1.0, 0.95, 0.78));
  float glow = lmLuma(lmBloom(uv, 0.5, 0.55));
  vec3 lin = lmToLinear(col) + glow * vec3(1.0, 0.72, 0.32) * 0.7;
  col = lmSoftClip(lmToSrgb(lin), 0.86);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
