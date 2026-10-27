float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c.rgb)), c.rgb, 0.8);
  col = mix(col, vec3(1.0), 0.22) * vec3(1.03, 0.98, 1.04);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
