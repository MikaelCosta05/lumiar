float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb + vec3(0.08, -0.01, 0.04) * smoothstep(0.2, 1.0, luma(c.rgb));
  col = mix(col, vec3(1.0, 0.85, 0.9), 0.08);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
