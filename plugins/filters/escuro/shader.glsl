vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = pow(c.rgb, vec3(1.5));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
