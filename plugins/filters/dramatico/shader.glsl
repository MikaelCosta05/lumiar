float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c.rgb)), c.rgb, 0.8);
  col = mix(col, col * col * (3.0 - 2.0 * col), 1.00);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.50);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  col *= 1.0 - dot(p, p) * 0.7;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
