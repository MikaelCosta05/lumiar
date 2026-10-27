float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * 0.85 + 0.08;
  col *= vec3(1.08, 1.0, 0.82);
  col = mix(vec3(luma(col)), col, 0.75);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  col *= 1.0 - dot(p, p) * 0.6;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
