// Game Boy (DMG): tela de cristal líquido com 144 linhas de pixels quadrados e quatro tons de verde (a paleta do
// aparelho). A luz de cada pixel é a média da área dele; os tons intermediários saem de um pontilhado ordenado
// 4×4 (como a Game Boy Camera fazia); quando os pixels são grandes, aparece a grade fina entre eles.

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int x = q.x, y = q.y ^ q.x;
  int v = ((y & 1) << 3) | ((x & 1) << 2) | ((y & 2)) | ((x & 2) >> 1);
  return (float(v) + 0.5) / 16.0;
}

/** Média da vizinhança (fixa, igual para todo o pixel grande): 12 pontos em dois anéis, em luz linear. */
vec3 around(vec2 c, float r) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236 + (i < 6 ? 0.0 : 0.2618);
    float rr = i % 2 == 0 ? r : r * 0.5;
    s += lmToLinear(getColor(c + vec2(cos(a), sin(a)) * rr * vec2(1.0 / ratio, 1.0)).rgb);
  }
  return s / 12.0;
}

vec4 effect(vec2 uv) {
  vec2 grid = vec2(floor(pixels * ratio + 0.5), pixels);
  vec2 cell = floor(uv * grid);
  vec2 f = fract(uv * grid);
  vec2 cs = 1.0 / grid;
  vec3 lin = vec3(0.0);
  lin += lmToLinear(getColor((cell + vec2(0.25, 0.25)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.75, 0.25)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.25, 0.75)) * cs).rgb);
  lin += lmToLinear(getColor((cell + vec2(0.75, 0.75)) * cs).rgb);
  // Brilho percebido (sRGB) com um pouco mais de contraste, como a tela do aparelho.
  float l = lmToSrgb(vec3(lmLuma(lin * 0.25))).x;
  // Realce de bordas, como o da Game Boy Camera: rosto e contornos não somem entre os quatro tons.
  float near = lmToSrgb(vec3(lmLuma(around((cell + 0.5) * cs, 2.5 * cs.y)))).x;
  l += (l - near) * 1.2;
  l = clamp((l - 0.08) * 1.15, 0.0, 1.0);
  float level = clamp(floor(l * 3.0 + bayer4(cell)), 0.0, 3.0);
  vec3 pal[4] = vec3[4](vec3(0.059, 0.220, 0.059), vec3(0.188, 0.384, 0.188), vec3(0.545, 0.675, 0.059), vec3(0.608, 0.737, 0.059));
  vec3 col = pal[int(level)];
  // Grade do cristal líquido: um fio mais escuro entre os pixels, suavizado, só quando o pixel tem tamanho para isso.
  float cellPx = resolution.y / grid.y;
  vec2 e = min(f, 1.0 - f) * cellPx;          // distância à borda do pixel, em px da tela
  float gap = 1.0 - smoothstep(0.0, 1.0, min(e.x, e.y) - 0.07 * cellPx + 0.5);
  col *= 1.0 - 0.18 * gap * smoothstep(3.0, 5.0, cellPx);
  return vec4(col, 1.0);
}
