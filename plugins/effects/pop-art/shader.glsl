float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  vec2 g = floor(uv * 2.0);
  vec2 local = fract(uv * 2.0);
  float l = luma(getColor(local).rgb);
  int panel = int(g.x + g.y * 2.0);
  vec3 A[4] = vec3[4](vec3(0.1, 0.05, 0.35), vec3(0.8, 0.0, 0.3), vec3(0.0, 0.25, 0.5), vec3(0.35, 0.0, 0.0));
  vec3 B[4] = vec3[4](vec3(1.0, 0.2, 0.6), vec3(0.0, 0.7, 0.9), vec3(1.0, 0.8, 0.0), vec3(0.1, 0.85, 0.4));
  vec3 C[4] = vec3[4](vec3(1.0, 0.95, 0.2), vec3(1.0, 0.95, 0.85), vec3(1.0, 0.4, 0.7), vec3(1.0, 0.9, 0.7));
  vec3 col = l < 0.33 ? A[panel] : (l < 0.62 ? B[panel] : C[panel]);
  vec2 dots = fract(uv * resolution / (6.0 * resolution.y / 720.0)) - 0.5;
  col *= 0.9 + 0.1 * step(length(dots), 0.3);
  return vec4(col, 1.0);
}
