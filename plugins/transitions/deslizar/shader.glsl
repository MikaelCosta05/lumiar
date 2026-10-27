vec4 transition(vec2 uv) {
  vec2 d = sign(direction);
  if (d == vec2(0.0)) d = vec2(1.0, 0.0);
  float e = 1.0 - pow(1.0 - progress, 3.0);
  vec2 p = uv + d * (1.0 - e);
  bool inside = p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
  vec4 from = vec4(getFromColor(uv).rgb * (1.0 - 0.4 * e), 1.0);
  return inside ? getToColor(p) : from;
}
