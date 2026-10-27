float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * vec3(1.12, 1.02, 0.85);
  col = mix(vec3(luma(col)), col, 1.1);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
