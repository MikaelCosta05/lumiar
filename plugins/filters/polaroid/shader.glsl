float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 col = c.rgb * 0.86 + vec3(0.06, 0.07, 0.09);
  col += vec3(0.05, 0.02, -0.04) * l;
  col = mix(vec3(luma(col)), col, 0.85);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
