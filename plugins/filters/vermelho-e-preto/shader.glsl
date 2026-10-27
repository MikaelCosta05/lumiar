vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.15, 0.85, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 col = mix(vec3(0.05, 0.0, 0.02), vec3(1.0, 0.12, 0.15), l);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
