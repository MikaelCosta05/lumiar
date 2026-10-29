float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
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
  float l = luma(c.rgb);
  vec3 col = saturate(c.rgb, 0.25) * moonLight * (0.95 - dark * 0.4);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.25 + dark * 0.6));
  // As partes mais claras (rostos) ficam pálidas, quase brancas.
  col = mix(col, vec3(luma(col)) * vec3(0.9, 1.05, 1.0) * 1.35, smoothstep(0.55, 0.95, l) * 0.5);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  col *= 1.0 - smoothstep(0.25, 0.9, length(p)) * (0.5 + 0.4 * dark);
  col += grainAt(uv, 1.2) * 0.03;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
