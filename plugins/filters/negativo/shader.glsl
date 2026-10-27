vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = 1.0 - c.rgb;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
