vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float a = fract(atan(p.y, p.x) / (2.0 * PI) + 1.0);
  float r = length(p) / length(vec2(ratio, 1.0) * 0.5);
  float v = (a + r * turns) / (1.0 + turns);
  float e = progress * (1.0 + smoothness);
  float m = 1.0 - smoothstep(e - smoothness, e, v);
  return mix(getFromColor(uv), getToColor(uv), m);
}
