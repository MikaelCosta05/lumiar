float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(0.0, 0.12, 0.35), vec3(0.88, 0.94, 1.0), smoothstep(0.05, 0.95, luma(c.rgb)));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
