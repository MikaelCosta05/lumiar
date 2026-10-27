float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 tint = mix(vec3(0.0, 0.42, 0.5), vec3(1.0, 0.6, 0.3), smoothstep(0.1, 0.9, l));
  vec3 col = c.rgb + (tint - 0.5) * 0.22;
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.5);
  return vec4(col, c.a);
}
