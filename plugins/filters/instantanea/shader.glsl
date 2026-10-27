float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 col = c.rgb * vec3(1.05, 1.0, 0.92) * 0.88 + 0.07;
  col += vec3(-0.02, 0.03, 0.0) * (1.0 - l);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  col *= 1.0 - dot(p, p) * 0.35;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
