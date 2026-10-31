// Realce HDR: mais detalhe e textura, como o "Clareza" e o mapeamento de tons local dos editores de foto.
// - Trabalha só na claridade (Oklab): realçar detalhe não cria franjas de cor nem muda o matiz da pele.
// - Duas escalas de detalhe: fina (textura, 3 px de 1080p) e média (volume, ~24 px, pelos níveis de detalhe).
//   Cada uma é comprimida (tanh) para que bordas fortes não ganhem halo, e a fina ignora variações minúsculas
//   (o ruído e a compressão do vídeo não são realçados).
// - Mapeamento local: áreas escuras abrem um pouco e áreas claras descem um pouco, pelo entorno, como numa foto
//   HDR bem feita (sem o cinza lavado).
// - Croma +12% com mais reforço nas cores apagadas (vibração), menos na faixa de matiz da pele.

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
  float L = lab.x;
  float Lfine = okOf(lmGaussianBlur(uv, lmPx(3.0)).rgb).x;
  float Lmid = okOf(wideBlur(uv, 24.0)).x;
  float dFine = L - Lfine;
  dFine *= smoothstep(0.004, 0.014, abs(dFine));
  float dMid = Lfine - Lmid;
  float outL = L + 0.06 * tanh(dFine / 0.06) * 1.1 + 0.07 * tanh(dMid / 0.07) * 0.6;
  outL += (0.62 - Lmid) * 0.12;
  float chroma = length(lab.yz);
  float hue = atan(lab.z, lab.y);
  float skin = (1.0 - smoothstep(0.25, 0.5, abs(hue - 1.0))) * (1.0 - smoothstep(0.08, 0.14, chroma));
  float boost = 1.0 + mix(0.12, 0.04, skin) * (1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.12, chroma)));
  return vec4(okToSrgb(vec3(clamp(outL, 0.0, 1.0), lab.yz * boost)), c.a);
}
