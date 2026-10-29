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
  float k = resolution.y / 720.0;
  vec2 px = vec2(1.2 * k / resolution.x, 0.0);
  vec3 s = (c.rgb * 2.0 + getColor(uv + px).rgb + getColor(uv - px).rgb) * 0.25;
  vec3 col = saturate(s, 0.4) * vec3(0.86, 0.97, 1.1);
  col = col * 0.74 + vec3(0.13, 0.14, 0.16);
  float levels = mix(48.0, 7.0, steps);
  col = floor(col * levels + 0.5) / levels;
  col *= 1.0 - scan * 0.22 * (0.5 + 0.5 * sin(uv.y * resolution.y * PI / (1.5 * k)));
  // Barra de zumbido passando devagar.
  col *= 1.0 - 0.05 * (0.5 + 0.5 * sin((uv.y + time * 0.12) * 2.0 * PI));
  col += grainAt(uv, 1.5) * 0.035;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
