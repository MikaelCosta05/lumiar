vec4 effect(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float maxR2 = dot(aspect * 0.5, aspect * 0.5);
  p *= 1.0 - strength * 0.5 * (1.0 - dot(p, p) / maxR2);
  return getColor(p / aspect + 0.5);
}
