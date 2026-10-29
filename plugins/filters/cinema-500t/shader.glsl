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
  // Corantes do negativo: cada canal empresta um pouco do vizinho.
  vec3 col = vec3(dot(c.rgb, vec3(0.93, 0.07, 0.0)), dot(c.rgb, vec3(0.03, 0.9, 0.07)), dot(c.rgb, vec3(0.0, 0.07, 0.93)));
  // Ombro do filme: meios-tons abertos, realces comprimidos sem estourar.
  col = col * 1.35 / (1.0 + col * 0.35);
  col = 0.5 + (sCurve(col, 0.4) - 0.5) * contrast;
  float l = luma(col);
  col += mix(vec3(-0.015, 0.005, 0.03), vec3(0.025, 0.008, -0.02), smoothstep(0.1, 0.8, l));
  col = saturate(col, 0.9);
  col *= vec3(1.0 + 0.07 * temp, 1.0 + 0.01 * temp, 1.0 - 0.07 * temp);
  col = col * 0.975 + vec3(0.012, 0.014, 0.018);
  col += grainAt(uv, 1.2) * grain * 0.09 * (0.35 + 4.0 * l * (1.0 - l));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
