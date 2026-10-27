vec4 transition(vec2 uv) {
  float idx = floor(uv.x * 3.0);
  float p = clamp((progress - idx * 0.15) / 0.7, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);
  float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;
  float y = uv.y + dir * (1.0 - e);
  if (e > 0.0 && y >= 0.0 && y <= 1.0) return getToColor(vec2(uv.x, y));
  return vec4(getFromColor(uv).rgb * (1.0 - 0.4 * e), 1.0);
}
