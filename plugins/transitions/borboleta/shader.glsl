vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  float w = 0.5 * (1.0 - e);
  float side = uv.x < 0.5 ? -1.0 : 1.0;
  float dist = abs(uv.x - 0.5);
  if (dist < w) {
    float k = dist / max(w, 1e-4);
    float y = (uv.y - 0.5) / (1.0 + 0.25 * e * k) + 0.5;
    if (y >= 0.0 && y <= 1.0) return vec4(getFromColor(vec2(0.5 + side * k * 0.5, y)).rgb * (1.0 - 0.45 * e), 1.0);
  }
  vec2 q = (uv - 0.5) / (0.85 + 0.15 * e) + 0.5;
  return vec4(getToColor(q).rgb * (0.4 + 0.6 * e), 1.0);
}
