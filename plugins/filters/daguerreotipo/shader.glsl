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
  float k = resolution.y / 720.0;
  vec2 r = vec2(1.5 * k) / resolution;
  vec3 s = (c.rgb * 2.0 + getColor(uv + vec2(r.x, 0.0)).rgb + getColor(uv - vec2(r.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, r.y)).rgb + getColor(uv - vec2(0.0, r.y)).rgb) / 6.0;
  float l = dot(s, vec3(0.1, 0.45, 0.45));
  l = mix(0.08, 0.9, smoothstep(0.02, 0.98, l));
  vec3 col = vec3(l) * vec3(0.93, 0.97, 1.03);
  col += smoothstep(0.6, 1.0, l) * vec3(0.03, 0.03, 0.035);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float d = length(p * vec2(0.85, 1.0));
  col *= mix(1.0, 1.0 - smoothstep(0.25, 0.75, d) * 0.7, vig);
  // Oxidação da prata pelas bordas: âmbar e um azul furta-cor.
  float n = fbm(uv * vec2(ratio, 1.0) * 3.0);
  float t = smoothstep(0.45, 0.8, d + (n - 0.5) * 0.35) * tarnish;
  vec3 rust = mix(vec3(0.42, 0.3, 0.18), vec3(0.25, 0.22, 0.4), smoothstep(0.4, 0.7, n));
  col = mix(col, col * 0.5 + rust * 0.45, t);
  float spot = step(0.996, hash(floor(uv * resolution / (2.0 * k))));
  col = mix(col, vec3(0.85), spot * 0.4 * tarnish);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
