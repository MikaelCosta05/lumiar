float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/** Ruído sem seno (estável em qualquer placa). */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Grão animado (-0.5 a 0.5), do mesmo tamanho em qualquer resolução. */
float grainAt(vec2 uv, float size) {
  vec2 cell = floor(uv * resolution / max(size * resolution.y / 720.0, 1.0));
  return hash(cell + vec2(mod(floor(time * 24.0), 113.0) * 17.31, 3.7)) - 0.5;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 r = vec2(7.0 * k) / resolution;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + 0.39;
    vec3 s = getColor(uv + vec2(cos(a), sin(a)) * r).rgb;
    glow += s * smoothstep(0.55, 1.0, luma(s));
  }
  // No infravermelho, pele e vermelhos aparecem mais claros.
  float l = dot(c.rgb, vec3(0.45, 0.4, 0.15));
  l = 1.0 - exp(-l * (1.5 + gain * 3.5));
  l += luma(glow / 8.0) * 0.8;
  l += grainAt(uv, 1.3) * noiseAmt * 0.45 * (1.15 - l);
  l = clamp(l, 0.0, 1.0);
  vec3 col = tint * l + vec3(smoothstep(0.7, 1.0, l) * 0.55);
  col *= 0.94 + 0.06 * sin(uv.y * resolution.y * PI / (2.0 * k));
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  col *= 1.0 - smoothstep(0.35, 0.95, length(p)) * 0.85;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
