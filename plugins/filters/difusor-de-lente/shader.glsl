float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 r = vec2(mix(8.0, 30.0, size) * resolution.y / 720.0) / resolution;
  vec3 glow = vec3(0.0);
  vec3 haze = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec3 s1 = getColor(uv + vec2(cos(a), sin(a)) * r).rgb;
    vec3 s2 = getColor(uv + vec2(cos(a + 0.26), sin(a + 0.26)) * r * 0.45).rgb;
    haze += s1 + s2;
    glow += s1 * smoothstep(0.45, 1.0, luma(s1)) + s2 * smoothstep(0.45, 1.0, luma(s2));
  }
  haze /= 24.0;
  glow /= 24.0;
  // Parte da luz se espalha pela imagem toda (pretos mais leves) e as luzes ganham halo.
  vec3 col = mix(c.rgb, haze, 0.18 * halo);
  col = 1.0 - (1.0 - col) * (1.0 - glow * vec3(1.05, 1.0, 0.95) * 2.2 * halo);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
