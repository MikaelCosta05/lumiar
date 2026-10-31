// Câmera digital antiga (começo dos anos 2000): realce de nitidez exagerado (halo claro e escuro em volta das
// bordas), altas luzes cortadas duro (pouca latitude do CCD), balanço de branco frio, cor um pouco forçada,
// chiado de cor nas sombras e a compressão JPEG: a cor vem em blocos de 16 px (4:2:0) e o claro e escuro ganha os
// blocos de 8 px. Tamanhos em px de 1080p.

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 o = lmPxUv(1.6);
  vec3 b = (getColor(uv + vec2(o.x, 0.0)).rgb + getColor(uv - vec2(o.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, o.y)).rgb + getColor(uv - vec2(0.0, o.y)).rgb) * 0.25;
  // Nitidez demais: halo nas bordas.
  vec3 col = c.rgb + (c.rgb - b) * sharp * 2.4;
  // JPEG: luma com um pouco do bloco de 8 px; cor do bloco de 16 px.
  vec2 px = vec2(lmPx(1.0) * resolution.y);           // 1 px de 1080p, em px da tela
  vec2 cell8 = 8.0 * px, cell16 = 16.0 * px;
  vec2 p = uv * resolution;
  vec2 b8 = (floor(p / cell8) + 0.5) * cell8 / resolution;
  vec2 b16 = (floor(p / cell16) + 0.5) * cell16 / resolution;
  vec2 q8 = cell8 * 0.25 / resolution, q16 = cell16 * 0.25 / resolution;
  vec3 avg8 = (getColor(b8 + q8).rgb + getColor(b8 - q8).rgb + getColor(b8 + vec2(q8.x, -q8.y)).rgb + getColor(b8 - vec2(q8.x, -q8.y)).rgb) * 0.25;
  vec3 avg16 = (getColor(b16 + q16).rgb + getColor(b16 - q16).rgb + getColor(b16 + vec2(q16.x, -q16.y)).rgb + getColor(b16 - vec2(q16.x, -q16.y)).rgb) * 0.25;
  float l = lmLuma(col);
  // Nos blocos lisos a compressão joga fora o detalhe fino; nas bordas fica mais.
  float detail = clamp(length(c.rgb - avg8) * 6.0, 0.0, 1.0);
  l = mix(l, mix(lmLuma(avg8), l, detail), blocks * 0.75);
  vec3 chroma = mix(col - lmLuma(col), avg16 - lmLuma(avg16), blocks * 0.85);
  col = vec3(l) + chroma;
  // Pouca latitude: o branco corta cedo e duro; balanço frio, cor um pouco forçada.
  col = col * 1.12 - 0.02;
  col = lmWhiteBalance(clamp(col, 0.0, 1.0), -0.2, 0.05);
  col = lmSaturate(col, 1.12);
  // Chiado de cor do CCD nas sombras (manchas de 2 a 3 px, por quadro de vídeo).
  float frame = floor(time * 29.97);
  vec2 g = uv * resolution / max(2.5 * px.x, 1.0);
  vec2 cn = vec2(lmNoise(vec3(g, frame)), lmNoise(vec3(g + 31.0, frame)));
  float shadow = 1.0 - smoothstep(0.0, 0.4, lmLuma(col));
  col += vec3(cn.x, -0.5 * (cn.x + cn.y), cn.y) * 0.05 * shadow;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
