float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float cellPx = max(pix * resolution.y / 720.0, 1.0);
  vec2 cell = floor(uv * resolution / cellPx);
  vec2 f = fract(uv * resolution / cellPx);
  vec3 s = getColor((cell + 0.5) * cellPx / resolution).rgb;
  float l = clamp((luma(s) - 0.06) * 1.15, 0.0, 1.0);
  // Pontilhado 2x2 para fingir mais tons com só quatro.
  float bx = mod(cell.x, 2.0);
  float by = mod(cell.y, 2.0);
  float b = bx * 2.0 + by * 3.0 - bx * by * 4.0;
  float level = clamp(floor(l * 3.999 + (b / 4.0 - 0.375) * 0.8), 0.0, 3.0);
  vec3 col = level < 0.5 ? vec3(0.06, 0.17, 0.08) : level < 1.5 ? vec3(0.19, 0.35, 0.19) : level < 2.5 ? vec3(0.53, 0.66, 0.17) : vec3(0.66, 0.75, 0.22);
  float edge = max(smoothstep(0.8, 1.0, f.x), smoothstep(0.8, 1.0, f.y));
  col *= 1.0 - edge * grid * 0.3 * step(2.5, cellPx);
  return vec4(col, c.a);
}
