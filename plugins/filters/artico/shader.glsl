float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c.rgb)), c.rgb, 0.6) * vec3(0.9, 1.0, 1.12) + 0.05;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
