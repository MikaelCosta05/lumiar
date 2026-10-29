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

vec4 applyFilter(vec4 c, vec2 uv) {
  // Sensível ao azul e ao verde, quase nada ao vermelho.
  float l = dot(c.rgb, vec3(0.02, 0.38, 0.6));
  l = clamp(0.5 + (l - 0.5) * contrast, 0.0, 1.0);
  l = mix(l, smoothstep(0.0, 1.0, l), 0.3);
  l *= 1.0 + (hash(vec2(floor(time * 16.0), 3.1)) - 0.5) * 0.16 * flick;
  l += grainAt(uv, 1.4) * 0.06;
  vec3 col = vec3(l) * vec3(1.0, 0.99, 0.96);
  col *= vignette(uv, 0.3 + 0.3 * flick);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
