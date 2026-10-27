float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * vec3(0.92, 1.04, 1.0) + vec3(0.0, 0.04, 0.03);
  col = mix(mix(vec3(luma(col)), col, 0.85), vec3(1.0), 0.06);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
