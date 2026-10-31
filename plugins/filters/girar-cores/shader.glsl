// Girar cores: desloca todas as cores pelo círculo cromático.
// - O giro é feito em Oklab (cor perceptual): cada cor muda de matiz mas mantém a claridade percebida, então a
//   imagem não escurece nem ganha manchas (no HSV um amarelo vira um azul muito mais escuro).
// - "Deslocamento" é a fração do círculo (0,25 = 90°). Cores que não cabem na tela depois do giro perdem só
//   croma (a claridade e o matiz ficam), em vez de serem cortadas por canal.

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

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = okOf(c.rgb);
  lab.yz = lmRotate(lab.yz, shift * 6.2831853);
  return vec4(okToSrgb(lab), c.a);
}
