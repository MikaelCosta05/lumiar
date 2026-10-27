float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = clamp(c.rgb * vec3(1.1, 0.98, 0.78) + vec3(0.04, 0.02, 0.0), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.40);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
