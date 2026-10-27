float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lum = vec3(luma(c.rgb));
  vec3 blend = mix(2.0 * c.rgb * lum, 1.0 - 2.0 * (1.0 - c.rgb) * (1.0 - lum), step(0.5, lum));
  vec3 col = mix(c.rgb, blend, 0.85);
  col = mix(vec3(luma(col)), col, 0.55);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
