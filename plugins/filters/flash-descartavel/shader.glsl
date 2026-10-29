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
  // O flash ilumina o que está perto do centro e cai rápido para as bordas.
  vec2 p = (uv - vec2(0.5, 0.55)) * vec2(ratio, 1.0);
  float gain = mix(1.0, 1.4 * exp(-dot(p, p) * 2.6) + 0.05, flash);
  vec3 col = c.rgb * gain;
  col = col / (1.0 + col * 0.25) * 1.25;
  col = saturate(col, 1.15);
  float l = luma(col);
  col += mix(vec3(-0.01, 0.02, 0.0), vec3(0.03, 0.01, -0.03), smoothstep(0.1, 0.7, l));
  col = sCurve(col, 0.25);
  col += grainAt(uv, 1.6) * grain * 0.13 * (0.5 + 2.0 * l * (1.0 - l));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
