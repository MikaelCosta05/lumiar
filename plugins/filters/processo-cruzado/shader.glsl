float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb;
  col.r = smoothstep(0.05, 0.95, col.r);
  col.g = col.g * 1.12 - 0.04;
  col.b = col.b * 0.65 + 0.18;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
