vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float a = atan(p.y, p.x) + progress * spin;
  float shape = length(p) / (0.5 + 0.5 * pow(abs(cos(2.5 * a)), 2.0));
  float e = progress * 2.2;
  float m = (1.0 - smoothstep(e - 0.05, e, shape)) * step(0.001, progress);
  return mix(getFromColor(uv), getToColor(uv), m);
}
