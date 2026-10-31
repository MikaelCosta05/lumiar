// Tingir: a imagem inteira numa cor só, mantendo luz e sombra (o modo "Cor" dos editores, feito direito).
// - Cada pixel fica com a claridade percebida dele (Oklab) e com o matiz e o croma da cor escolhida: o rosto
//   continua com o mesmo volume, só muda a cor.
// - Perto do preto e do branco a cor perde croma sozinha (só o croma é reduzido até caber na tela), então as
//   sombras não viram manchas saturadas e as luzes chegam ao branco sem estourar um canal.

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
  vec2 ink = okOf(tint).yz;
  return vec4(okToSrgb(vec3(lab.x, ink)), c.a);
}
