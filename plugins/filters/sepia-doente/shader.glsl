float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 7.1;
    a *= 0.5;
  }
  return v / 0.9375;
}

/** Grão animado (-0.5 a 0.5), do mesmo tamanho em qualquer resolução. */
float grainAt(vec2 uv, float size) {
  vec2 cell = floor(uv * resolution / max(size * resolution.y / 720.0, 1.0));
  return hash(cell + vec2(mod(floor(time * 24.0), 113.0) * 17.31, 3.7)) - 0.5;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  l = mix(l, smoothstep(0.0, 1.0, l), 0.4);
  vec3 dark = vec3(0.08, 0.075, 0.035);
  vec3 mid = vec3(0.44, 0.41, 0.24);
  vec3 light = vec3(0.86, 0.84, 0.64);
  vec3 col = l < 0.5 ? mix(dark, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
  vec2 p = uv * vec2(ratio, 1.0);
  col *= 1.0 - smoothstep(0.55, 0.85, fbm(p * 3.0 + 11.0)) * stains * 0.55;
  col = mix(col, col * vec3(0.8, 0.85, 0.55), smoothstep(0.4, 0.7, fbm(p * 1.5)) * stains * 0.5);
  // Bordas comidas: vinheta irregular.
  float edge = length((uv - 0.5) * vec2(ratio, 1.0)) + (fbm(p * 2.0 + 3.0) - 0.5) * 0.25;
  col *= mix(1.0, 1.0 - smoothstep(0.35, 0.85, edge) * 0.8, vig);
  col *= 1.0 + (hash(vec2(floor(time * 12.0), 1.0)) - 0.5) * 0.06;
  col += grainAt(uv, 1.3) * 0.05;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
