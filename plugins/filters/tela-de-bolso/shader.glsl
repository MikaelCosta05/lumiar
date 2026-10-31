// Tela de bolso: videogame portátil antigo com tela de cristal líquido verde. Pixels grandes (px de 720p, como antes, inteiros
// para a grade ficar regular), quatro tons da paleta do aparelho, pontilhado ordenado para os tons do meio e a
// grade fina entre os pixels (borda suavizada), que aparece quando o pixel tem tamanho para isso.

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int x = q.x, y = q.y ^ q.x;
  int v = ((y & 1) << 3) | ((x & 1) << 2) | (y & 2) | ((x & 2) >> 1);
  return (float(v) + 0.5) / 16.0;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float cellPx = max(floor(pix * resolution.y / 720.0 + 0.5), 1.0);
  vec2 cell = floor(uv * resolution / cellPx);
  vec2 f = fract(uv * resolution / cellPx);
  vec2 cs = cellPx / resolution;
  vec3 lin = vec3(0.0);
  lin += lmToLinear(getColor((cell + vec2(0.25, 0.25)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.75, 0.25)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.25, 0.75)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.75, 0.75)) * cs).rgb);
  float l = lmToSrgb(vec3(lmLuma(lin * 0.25))).x;
  l = clamp((l - 0.06) * 1.15, 0.0, 1.0);
  float level = clamp(floor(l * 3.0 + bayer4(cell)), 0.0, 3.0);
  vec3 pal[4] = vec3[4](vec3(0.06, 0.17, 0.08), vec3(0.19, 0.35, 0.19), vec3(0.53, 0.66, 0.17), vec3(0.66, 0.75, 0.22));
  vec3 col = pal[int(level)];
  // Grade da tela: fio escuro entre os pixels, suavizado em px da tela.
  vec2 e = min(f, 1.0 - f) * cellPx;
  float gap = 1.0 - smoothstep(0.0, 1.0, min(e.x, e.y) - 0.08 * cellPx + 0.5);
  col *= 1.0 - gap * grid * 0.35 * smoothstep(2.5, 4.0, cellPx);
  return vec4(col, c.a);
}
