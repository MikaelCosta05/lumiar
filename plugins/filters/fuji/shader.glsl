float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 col = c.rgb * vec3(1.0, 1.04, 1.0);
  col += vec3(-0.02, 0.03, 0.05) * (1.0 - l);
  col += vec3(0.03, 0.0, 0.02) * l;
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
