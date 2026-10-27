float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * vec3(1.1, 0.98, 0.82);
  col += vec3(0.22, 0.1, -0.04) * smoothstep(0.3, 1.0, uv.y) * 0.6;
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
