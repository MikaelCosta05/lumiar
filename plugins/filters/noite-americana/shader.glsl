vec4 applyFilter(vec4 c, vec2 uv) {
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = mix(vec3(l), c.rgb, 0.35) * vec3(0.55, 0.7, 1.0) * 0.6;
  col = pow(clamp(col, 0.0, 1.0), vec3(1.2));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
