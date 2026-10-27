vec4 transition(vec2 uv) {
  float w = cos(progress * PI);
  float aw = max(abs(w), 0.001);
  float x = (uv.x - 0.5) / aw + 0.5;
  float tilt = 0.25 * sin(progress * PI);
  float sc = 1.0 + tilt * (x - 0.5) * (w > 0.0 ? 1.0 : -1.0);
  float y = (uv.y - 0.5) / sc + 0.5;
  if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec4 c = w > 0.0 ? getFromColor(vec2(x, y)) : getToColor(vec2(x, y));
  return vec4(c.rgb * (0.6 + 0.4 * aw), 1.0);
}
