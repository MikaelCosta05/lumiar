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
  float k = resolution.y / 720.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
  float a = float(i) * 0.785;
  vec3 s = getColor(uv + vec2(cos(a), sin(a)) * 6.0 * k / resolution).rgb;
  glow += s * smoothstep(0.7, 1.0, dot(s, vec3(0.333)));
  }
  vec3 col = c.rgb * vec3(0.88, 0.97, 1.12);
  col += glow / 8.0 * vec3(1.0, 0.25, 0.1) * 1.2;
  col = sCurve(col, 0.35);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
