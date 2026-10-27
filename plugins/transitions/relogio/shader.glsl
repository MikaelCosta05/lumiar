vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float t = fract(atan(p.x, p.y) / (2.0 * PI) + 1.0);
  float e = progress * (1.0 + smoothness);
  float m = 1.0 - smoothstep(e - smoothness, e, t);
  return mix(getFromColor(uv), getToColor(uv), m);
}
