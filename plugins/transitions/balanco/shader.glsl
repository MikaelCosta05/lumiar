mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec4 transition(vec2 uv) {
  float e = progress * progress;
  vec2 aspect = vec2(ratio, 1.0);
  vec2 q = rot(e * PI * 0.6) * (uv * aspect) / aspect;
  bool inside = q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0;
  if (!inside) return vec4(getToColor(uv).rgb * (0.7 + 0.3 * e), 1.0);
  return getFromColor(q);
}
