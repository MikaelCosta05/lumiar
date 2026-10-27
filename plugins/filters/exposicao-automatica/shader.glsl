vec4 applyFilter(vec4 c, vec2 uv) {
  float avg = 0.0;
  for (int j = 0; j < 5; j++) {
  for (int i = 0; i < 5; i++) avg += dot(getColor((vec2(float(i), float(j)) + 0.5) / 5.0).rgb, vec3(0.2126, 0.7152, 0.0722));
  }
  avg /= 25.0;
  float gamma = clamp(log(0.45) / log(clamp(avg, 0.02, 0.98)), 0.5, 2.0);
  vec3 col = pow(c.rgb, vec3(gamma));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
