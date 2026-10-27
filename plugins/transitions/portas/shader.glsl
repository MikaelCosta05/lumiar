vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  float doorW = 0.5 - e * 0.5;
  vec2 tuv = (uv - 0.5) / (0.85 + 0.15 * e) + 0.5;
  vec4 next = vec4(getToColor(tuv).rgb * (0.5 + 0.5 * e), 1.0);
  if (uv.x < doorW) {
    float k = uv.x / doorW;
    float y = (uv.y - 0.5) / (1.0 + 0.2 * e * (1.0 - k)) + 0.5;
    if (y < 0.0 || y > 1.0) return next;
    return vec4(getFromColor(vec2(k * 0.5, y)).rgb * (1.0 - 0.3 * e), 1.0);
  }
  if (uv.x > 1.0 - doorW) {
    float k = (uv.x - (1.0 - doorW)) / doorW;
    float y = (uv.y - 0.5) / (1.0 + 0.2 * e * k) + 0.5;
    if (y < 0.0 || y > 1.0) return next;
    return vec4(getFromColor(vec2(0.5 + k * 0.5, y)).rgb * (1.0 - 0.3 * e), 1.0);
  }
  return next;
}
