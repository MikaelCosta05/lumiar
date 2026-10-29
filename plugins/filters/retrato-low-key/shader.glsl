float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb;
  float l = luma(col);
  float keep = smoothstep(0.35, 0.85, l);
  vec3 deep = pow(clamp(col, 0.0, 1.0), vec3(1.0 + depth * 1.4));
  col = mix(deep, col, keep);
  col = saturate(col, mix(0.7, 1.0, keep));
  col *= mix(vec3(1.0), vec3(1.04, 1.0, 0.94), keep);
  // Vinheta oval um pouco acima do centro, onde costuma estar o rosto.
  vec2 p = (uv - vec2(0.5, 0.55)) * vec2(ratio * 0.75, 1.0);
  col *= mix(1.0, 1.0 - smoothstep(0.2, 0.75, length(p)) * 0.85, vig);
  col = sCurve(col, 0.2);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
