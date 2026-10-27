vec4 transition(vec2 uv) {
  float seg = floor(progress * 7.0);
  bool next = mod(seg, 2.0) > 0.5 || progress > 0.85;
  float z = 1.0 + 0.08 * fract(progress * 7.0) * sin(progress * PI);
  vec2 q = (uv - 0.5) / z + 0.5;
  return next ? getToColor(q) : getFromColor(q);
}
