vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 avg = vec3(0.0);
  for (int j = 0; j < 5; j++) {
  for (int i = 0; i < 5; i++) avg += getColor((vec2(float(i), float(j)) + 0.5) / 5.0).rgb;
  }
  avg /= 25.0;
  float g = dot(avg, vec3(0.333));
  vec3 col = mix(c.rgb, c.rgb * (g / max(avg, vec3(0.02))), 0.8);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
