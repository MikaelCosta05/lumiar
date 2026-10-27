vec4 applyFilter(vec4 c, vec2 uv) {
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = l < 0.5 ? 2.0 * l * tint : 1.0 - 2.0 * (1.0 - l) * (1.0 - tint);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
