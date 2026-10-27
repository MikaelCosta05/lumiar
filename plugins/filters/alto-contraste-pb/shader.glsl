vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.35, 0.65, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 col = vec3(l);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
