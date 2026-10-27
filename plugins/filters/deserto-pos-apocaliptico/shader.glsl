vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec3 saturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

vec3 splitTone(vec3 c, vec3 shadows, vec3 highlights, float amount) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c + (mix(shadows, highlights, smoothstep(0.0, 1.0, l)) - 0.5) * amount;
}

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = splitTone(c.rgb, vec3(0.1, 0.35, 0.5), vec3(1.0, 0.6, 0.15), 0.5);
  col = saturate(col, 1.25);
  col = sCurve(col, 0.7);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
