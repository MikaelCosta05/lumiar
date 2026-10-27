float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c.rgb)), c.rgb, 1.5);
  col = (col - 0.5) * 1.15 + 0.5;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
