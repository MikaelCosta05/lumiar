vec4 effect(vec2 uv) {
  float g = max(1.0, floor(grid + 0.5));
  vec2 cell = fract(uv * g);
  vec2 border = gap * (resolution.y / 720.0) / resolution * g * 0.5;
  if (cell.x < border.x || cell.x > 1.0 - border.x || cell.y < border.y || cell.y > 1.0 - border.y) return vec4(tint, 1.0);
  return getColor(cell);
}
