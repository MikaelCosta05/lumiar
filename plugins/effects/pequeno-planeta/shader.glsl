vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0) / zoom;
  float r = length(p);
  float a = atan(p.x, -p.y);
  return getColor(vec2(fract(a / (2.0 * PI) + 0.5 + time * spin), clamp(r * 2.0, 0.0, 1.0)));
}
