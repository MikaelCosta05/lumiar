float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.1, 0.95, 1.0 - luma(c.rgb));
  vec3 col = mix(vec3(0.0, 0.03, 0.08), vec3(0.75, 0.92, 1.0), l);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
