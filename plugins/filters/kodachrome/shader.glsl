float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = clamp(c.rgb * vec3(1.08, 1.0, 0.9), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.60);
  col = mix(vec3(luma(col)), col, 1.25);
  col += vec3(-0.02, 0.0, 0.03) * (1.0 - luma(col));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
