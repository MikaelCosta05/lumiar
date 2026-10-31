// Pop: cores puras e chapadas, bem saturadas (pôster pop art).
// - A claridade (Oklab, perceptual) é dividida em 5 faixas chapadas, como antes, mas a passagem de uma faixa para a
//   outra é suavizada em 1 px (sem serrilhado), e a imagem é alisada 1,5 px de 1080p antes de dividir (bem mais nas áreas lisas), para que o
//   ruído do vídeo não vire ilhas e pontinhos nas áreas lisas.
// - Croma de 2,6× (limitado a +0,14) em Oklab (o brilho percebido não muda), com menos reforço na faixa de matiz da pele para
//   o rosto não virar laranja; o que não cabe na tela perde só croma.

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

/** Arredonda x para "n" níveis, com o degrau suavizado em 1 px (derivada da tela). */
float bands(float x, float n) {
  float y = x * n;
  float w = max(fwidth(y), 1e-4) * 0.5;
  return (floor(y) + smoothstep(0.5 - w, 0.5 + w, fract(y))) / n;
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

/**
 * Imagem preparada para dividir em faixas: alisada 1,5 px; nas áreas lisas (fundo, céu, parede), alisada bem mais,
 * para que os blocos da compressão do vídeo não virem degraus de escada nas bordas das faixas.
 */
vec3 posterSource(vec2 uv, vec3 sharp) {
  vec3 near = lmGaussianBlur(uv, lmPx(1.5)).rgb;
  vec3 far = wideBlur(uv, 16.0);
  float flat_ = 1.0 - smoothstep(0.015, 0.06, length(near - far));
  return mix(mix(sharp, near, 0.75), far, flat_);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 base = posterSource(uv, c.rgb);
  vec3 lab = okOf(base);
  // As faixas vão do preto a um branco levemente abaixo de 1 (a luz do rosto não vira um buraco branco).
  float L = mix(0.08, 0.95, bands(lab.x, 5.0));
  // Pele: matiz entre ~35° e ~80° com croma moderado ganha só um pouco de croma.
  float hue = atan(lab.z, lab.y);
  float chroma = length(lab.yz);
  float skin = (1.0 - smoothstep(0.25, 0.5, abs(hue - 1.0))) * (1.0 - smoothstep(0.09, 0.15, chroma));
  float boost = mix(2.6, 1.5, skin);
  float newChroma = min(chroma * boost, chroma + mix(0.14, 0.05, skin));
  return vec4(okToSrgb(vec3(L, lab.yz * (newChroma / max(chroma, 1e-5)))), c.a);
}
