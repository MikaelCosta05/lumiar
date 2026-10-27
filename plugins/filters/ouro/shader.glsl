float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 col = mix(vec3(0.15, 0.08, 0.0), vec3(1.0, 0.85, 0.45), smoothstep(0.0, 0.9, l));
  col += vec3(0.3, 0.25, 0.1) * pow(l, 4.0);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
