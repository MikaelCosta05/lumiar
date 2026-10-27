float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 tint = mix(vec3(0.25, 0.05, 0.55), vec3(1.0, 0.35, 0.8), l);
  vec3 col = mix(c.rgb, tint * (0.4 + l), 0.45);
  col.b += 0.06;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
