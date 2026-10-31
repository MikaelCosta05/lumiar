// Posterizado: poucas cores por canal, como um pôster impresso.
// - Cada canal é arredondado para "Níveis" degraus (como antes), mas a passagem de um degrau para o outro é
//   suavizada em 1 px pela derivada da tela: as bordas das áreas chapadas ficam lisas, sem serrilhado.
// - A imagem é alisada 1,5 px de 1080p antes, e bem mais nas áreas lisas (onde a compressão do vídeo deixa
//   blocos), para o ruído não virar pontinhos e ilhas piscando e os blocos não virarem degraus de escada.

vec3 bands(vec3 x, float n) {
  vec3 y = x * n;
  vec3 w = max(fwidth(y), vec3(1e-4)) * 0.5;
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
  vec3 col = bands(clamp(base, 0.0, 1.0), max(levels, 1.0));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
