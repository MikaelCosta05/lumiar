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

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec3 redscaleRamp(float l, float y) {
  vec3 a = vec3(0.07, 0.01, 0.01);
  vec3 b = vec3(0.45, 0.06, 0.02);
  vec3 d = vec3(0.88, 0.36, 0.08);
  vec3 e = mix(vec3(0.98, 0.62, 0.25), vec3(1.0, 0.9, 0.55), y);
  if (l < 0.3) return mix(a, b, l / 0.3);
  if (l < 0.65) return mix(b, d, (l - 0.3) / 0.35);
  return mix(d, e, (l - 0.65) / 0.35);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // Exposto pelas costas, o filme quase não registra o azul.
  float l = clamp(dot(c.rgb, vec3(0.45, 0.45, 0.1)), 0.0, 1.0);
  l = mix(l, smoothstep(0.0, 1.0, l), 0.4);
  vec3 col = redscaleRamp(l, yellow);
  col += (c.rgb - vec3(luma(c.rgb))) * vec3(0.18, 0.1, 0.04);
  col += grainAt(uv, 1.3) * grain * 0.1 * vec3(1.0, 0.7, 0.5);
  col *= vignette(uv, 0.35);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
