float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 r = vec2(mix(6.0, 24.0, size) * k) / resolution;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec3 s1 = getColor(uv + vec2(cos(a), sin(a)) * r).rgb;
    vec3 s2 = getColor(uv + vec2(cos(a + 0.26), sin(a + 0.26)) * r * 0.45).rgb;
    glow += s1 * smoothstep(0.55, 1.0, luma(s1)) + s2 * smoothstep(0.55, 1.0, luma(s2));
  }
  glow /= 24.0;
  // Alisa de leve os meios-tons (textura da pele) sem tocar nos pretos.
  vec2 p = vec2(1.5 * k) / resolution;
  vec3 soft = (getColor(uv + vec2(p.x, 0.0)).rgb + getColor(uv - vec2(p.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, p.y)).rgb + getColor(uv - vec2(0.0, p.y)).rgb) * 0.25;
  float l = luma(c.rgb);
  vec3 col = mix(c.rgb, soft, 0.3 * halo * smoothstep(0.15, 0.4, l) * (1.0 - smoothstep(0.75, 0.95, l)));
  col = 1.0 - (1.0 - col) * (1.0 - glow * 1.9 * halo);
  col = sCurve(col, 0.08);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
