float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  vec2 grid = vec2(floor(size * ratio + 0.5), size);
  vec2 cell = floor(uv * grid);
  vec2 local = fract(uv * grid);
  float delay = (cell.x / grid.x) * 0.5 + hash(cell) * 0.2;
  float t = clamp((progress - delay) / 0.3, 0.0, 1.0);
  float w = cos(t * PI);
  float x = (local.x - 0.5) / max(abs(w), 0.001) + 0.5;
  if (x < 0.0 || x > 1.0) return vec4(0.05, 0.05, 0.07, 1.0);
  vec2 src = (cell + vec2(x, local.y)) / grid;
  return w > 0.0 ? getFromColor(src) : getToColor(src);
}
