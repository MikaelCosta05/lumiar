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

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

/** Grão animado (-0.5 a 0.5), do mesmo tamanho em qualquer resolução. */
float grainAt(vec2 uv, float size) {
  vec2 cell = floor(uv * resolution / max(size * resolution.y / 720.0, 1.0));
  return hash(cell + vec2(mod(floor(time * 24.0), 113.0) * 17.31, 3.7)) - 0.5;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // A mão balança devagar e treme rápido.
  vec2 jit = (vec2(vnoise(vec2(time * 2.3, 1.7)), vnoise(vec2(5.1, time * 2.9))) - 0.5) * 0.08 * shake;
  jit += (vec2(vnoise(vec2(time * 11.0, 3.3)), vnoise(vec2(8.2, time * 13.0))) - 0.5) * 0.012 * shake;
  vec2 p = (uv - lampPos - jit) * vec2(ratio, 1.0);
  float d = length(p) / lampSize;
  float beam = 1.0 - smoothstep(0.5, 1.0, d);
  float hot = exp(-d * d * 5.0) * 0.45;
  float rd = (d - 0.72) / 0.08;
  float ring = exp(-rd * rd) * 0.18;
  float spill = (1.0 - smoothstep(1.0, 2.4, d)) * 0.14;
  float light = beam * (1.0 + hot) + ring + spill;
  // Pilha fraca: às vezes a luz falha por um instante.
  light *= 1.0 - step(0.97, hash(vec2(floor(time * 20.0), 4.0))) * 0.4 * shake;
  vec3 lit = c.rgb * vec3(1.06, 1.0, 0.86) * light * 1.15;
  vec3 dim = saturate(c.rgb, 0.4) * vec3(0.6, 0.7, 0.95) * (1.0 - darkness);
  vec3 col = max(lit, dim);
  col += grainAt(uv, 1.3) * 0.04 * (1.0 - beam);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
