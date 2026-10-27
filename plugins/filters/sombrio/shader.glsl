float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c.rgb)), c.rgb, 0.55) * vec3(0.92, 1.0, 0.98);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.25));
  col += vec3(0.0, 0.03, 0.04) * (1.0 - luma(col));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
