vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.05, 0.95, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 col = mix(vec3(0.0, 0.32, 0.36), vec3(1.0, 0.55, 0.45), l);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
