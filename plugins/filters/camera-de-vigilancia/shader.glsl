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

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 cell = vec2(max(mix(1.0, 4.0, lowres) * k, 1.0)) / resolution;
  vec2 q = (floor(uv / cell) + 0.5) * cell;
  // Blocos macios: a média de quatro pontos do bloco.
  vec3 s = (getColor(q + cell * vec2(0.3, 0.3)).rgb + getColor(q + cell * vec2(-0.3, 0.3)).rgb
    + getColor(q + cell * vec2(0.3, -0.3)).rgb + getColor(q - cell * 0.3).rgb) * 0.25;
  vec3 col = saturate(s, 0.15) * vec3(0.9, 1.0, 1.06);
  col = smoothstep(0.1, 0.92, col);
  float row = floor(uv.y * resolution.y / (2.0 * k));
  col *= 0.93 + 0.07 * mod(row, 2.0);
  float roll = fract(uv.y + time * 0.05);
  col += smoothstep(0.0, 0.02, roll) * (1.0 - smoothstep(0.02, 0.06, roll)) * 0.06;
  col += grainAt(uv, 1.5) * noiseAmt * 0.16;
  col *= vignette(uv, 0.4);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
