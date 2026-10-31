// Mundo invertido: todas as cores vão para o lado oposto do círculo cromático.
// - O giro de 180° é feito em Oklab: cada cor vira a complementar com a mesma claridade percebida (o céu azul
//   vira um laranja do mesmo brilho, a pele vira um azul-acinzentado do mesmo brilho), sem inverter luz e sombra.
// - Cores que não cabem na tela depois do giro perdem só croma, em vez de serem cortadas por canal.

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
  return vec4(okToSrgb(vec3(lab.x, -lab.yz)), c.a);
}
