vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(1.5 * k) / resolution;
  int r = int(clamp(radius, 1.0, 4.0));
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -4; j <= 4; j++) {
    for (int i = -4; i <= 4; i++) {
      if (abs(i) > r || abs(j) > r) continue;
      vec3 c = getColor(uv + vec2(float(i), float(j)) * px).rgb;
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m0 += c; s0 += c2; }
      if (i >= 0 && j <= 0) { m1 += c; s1 += c2; }
      if (i <= 0 && j >= 0) { m2 += c; s2 += c2; }
      if (i >= 0 && j >= 0) { m3 += c; s3 += c2; }
    }
  }
  float n = float((r + 1) * (r + 1));
  m0 /= n; m1 /= n; m2 /= n; m3 /= n;
  vec3 v0 = abs(s0 / n - m0 * m0);
  vec3 v1 = abs(s1 / n - m1 * m1);
  vec3 v2 = abs(s2 / n - m2 * m2);
  vec3 v3 = abs(s3 / n - m3 * m3);
  // Usa o quadrante mais "liso": é isso que dá o aspecto de pincelada.
  vec3 result = m0;
  float best = v0.r + v0.g + v0.b;
  float e1 = v1.r + v1.g + v1.b;
  float e2 = v2.r + v2.g + v2.b;
  float e3 = v3.r + v3.g + v3.b;
  if (e1 < best) { best = e1; result = m1; }
  if (e2 < best) { best = e2; result = m2; }
  if (e3 < best) { result = m3; }
  return vec4(result, 1.0);
}
