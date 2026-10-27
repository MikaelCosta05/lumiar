vec4 transition(vec2 uv) {
  float idx = floor(uv.y * count);
  float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;
  float p = clamp((progress - idx / count * 0.3) / 0.7, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);
  float x = uv.x + dir * e;
  if (x < 0.0 || x > 1.0) return getToColor(vec2(x - dir, uv.y));
  return getFromColor(vec2(x, uv.y));
}
