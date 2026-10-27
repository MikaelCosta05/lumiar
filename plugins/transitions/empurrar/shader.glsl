// Baseado em "directional" do gl-transitions (MIT)
vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  vec2 p = uv + e * sign(direction);
  vec2 f = fract(p);
  float inside = step(0.0, p.y) * step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0);
  return mix(getToColor(f), getFromColor(f), inside);
}
