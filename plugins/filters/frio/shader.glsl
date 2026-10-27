vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * vec3(0.88, 0.98, 1.15) + vec3(0.0, 0.01, 0.03);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
