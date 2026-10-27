float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  vec3 tone = mix(vec3(0.0, 0.55, 0.6), vec3(1.0, 0.45, 0.75), smoothstep(0.15, 0.85, l));
  vec3 col = mix(c.rgb, tone * (0.35 + l), 0.4);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
