vec4 applyFilter(vec4 c, vec2 uv) {
  float l = clamp(c.g * 1.4 + c.r * 0.3 - c.b * 0.6, 0.0, 1.0);
  vec3 col = vec3(smoothstep(0.05, 0.9, l));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
