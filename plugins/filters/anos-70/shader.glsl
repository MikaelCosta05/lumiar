float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 col = c.rgb * 0.9 + 0.06;
  col *= vec3(1.1, 1.0, 0.75);
  col += vec3(0.0, 0.05, 0.03) * (1.0 - l);
  col = mix(vec3(luma(col)), col, 0.85);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
