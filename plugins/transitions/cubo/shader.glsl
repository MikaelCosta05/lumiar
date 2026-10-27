vec4 transition(vec2 uv) {
  float th = progress * PI * 0.5;
  float c = cos(th);
  float s = sin(th);
  float w1 = c / (c + s);
  float shared = 1.0 + 0.15 * sin(2.0 * th);
  if (uv.x < w1) {
    float x = uv.x / w1;
    float y = (uv.y - 0.5) / mix(1.0 - 0.3 * s, shared, x) + 0.5;
    if (y < 0.0 || y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
    return vec4(getFromColor(vec2(x, y)).rgb * (1.0 - 0.4 * s), 1.0);
  }
  float x = (uv.x - w1) / (1.0 - w1);
  float y = (uv.y - 0.5) / mix(shared, 1.0 - 0.3 * c, x) + 0.5;
  if (y < 0.0 || y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  return vec4(getToColor(vec2(x, y)).rgb * (1.0 - 0.4 * c), 1.0);
}
