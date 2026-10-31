// Dramático: contraste fortíssimo, cores contidas e bordas escuras.
// - O contraste é uma curva em S forte aplicada só à claridade (Oklab): o matiz da pele não muda e os pretos
//   chegam ao preto com pé (sem empastar de vez); as cores perdem 20% do croma, como antes.
// - Clareza: o volume (detalhe de ~30 px de 1080p, pelos níveis de detalhe) é reforçado e comprimido para não
//   fazer halo nas bordas.
// - Vinheta de lente forte (cos⁴, proporção certa), aplicada em luz linear.

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
float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}
/** Imagem borrada larga (raio ~"px" de 1080p) pelos níveis de detalhe, com filtro em tenda (sem blocos). */
vec3 wideBlur(vec2 uv, float px) {
  float level = log2(max(px * resolution.y / 1080.0, 1.0)) - 1.0;
  vec2 texel = exp2(level) / resolution;
  vec3 s = getColorLod(uv, level).rgb * 4.0;
  s += (getColorLod(uv + vec2(texel.x, 0.0), level).rgb + getColorLod(uv - vec2(texel.x, 0.0), level).rgb
    + getColorLod(uv + vec2(0.0, texel.y), level).rgb + getColorLod(uv - vec2(0.0, texel.y), level).rgb) * 2.0;
  s += getColorLod(uv + texel, level).rgb + getColorLod(uv - texel, level).rgb
    + getColorLod(uv + vec2(texel.x, -texel.y), level).rgb + getColorLod(uv + vec2(-texel.x, texel.y), level).rgb;
  return s / 16.0;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = okOf(c.rgb);
  float around = okOf(wideBlur(uv, 30.0)).x;
  float L = lab.x + 0.06 * tanh((lab.x - around) / 0.06) * 0.6;
  // Curva S forte no espaço da claridade (Oklab L de um cinza médio ≈ 0,57).
  float outL = paperCurve(clamp(L, 0.0, 1.0), 7.0, 0.57);
  // O croma perde 20% e acompanha só em parte a claridade nova (como uma S em RGB, as sombras não desbotam).
  float scale = 0.8 * clamp(pow(max(outL, 1e-3) / max(lab.x, 1e-3), 0.3), 0.7, 1.25);
  vec3 col = okToSrgb(vec3(outL, lab.yz * scale));
  col = lmToSrgb(lmToLinear(col) * lmVignette(uv, 0.92, 0.5));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
