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

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = pow(clamp(luma(c.rgb), 0.0, 1.0), 0.92);
  l = mix(l, smoothstep(0.0, 1.0, l), 0.15);
  vec3 dark = mix(vec3(0.14), vec3(0.17, 0.13, 0.1), warm);
  vec3 mid = mix(vec3(0.52), vec3(0.58, 0.52, 0.45), warm);
  vec3 light = mix(vec3(0.95), vec3(0.97, 0.95, 0.9), warm);
  vec3 col = l < 0.5 ? mix(dark, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
  // Fibras do papel de algodão.
  vec2 fp = uv * resolution / (2.5 * resolution.y / 720.0);
  float fibers = vnoise(fp) * 0.5 + vnoise(fp * vec2(0.25, 1.6)) * 0.5;
  col *= 1.0 - (fibers - 0.5) * 0.08 * paper;
  // Emulsão passada a pincel: a borda do papel fica sem imagem.
  vec2 p = (uv - 0.5) * 2.0;
  float edge = max(abs(p.x), abs(p.y)) + (fbm(uv * 6.0) - 0.5) * 0.12;
  col = mix(col, light, smoothstep(0.9, 1.0, edge) * paper);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
