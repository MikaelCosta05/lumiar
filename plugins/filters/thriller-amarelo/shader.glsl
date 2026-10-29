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

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb;
  float l = luma(col);
  col = mix(col, col * vec3(1.06, 0.98, 0.6) + vec3(0.03, 0.02, 0.0), yellowAmt);
  col = mix(col, vec3(1.0, 0.93, 0.68) * l * 1.08, smoothstep(0.65, 1.0, l) * 0.5 * yellowAmt);
  col = saturate(col, 0.82);
  col = 0.5 + (sCurve(col, 0.45) - 0.5) * contrast;
  col = mix(col, col * vec3(0.95, 0.85, 0.55), (1.0 - smoothstep(0.0, 0.35, l)) * 0.6 * yellowAmt);
  col *= vignette(uv, 0.4);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
