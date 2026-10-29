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
  vec2 p = uv * vec2(ratio, 1.0);
  // Frente da queimadura: parte da borda e avança com um contorno irregular.
  float edge = min(min(uv.x, 1.0 - uv.x) * ratio, min(uv.y, 1.0 - uv.y));
  float n = fbm(p * 3.0 + vec2(time * 0.12, -time * 0.07));
  // A queimadura não avança igual: alguns trechos da borda comem bem mais que outros.
  float reach = 0.25 + 1.5 * smoothstep(0.3, 0.75, vnoise(p * 1.3 + 4.0 + time * 0.05));
  float s = (edge + (n - 0.5) * 0.22) / (burn * 0.2 * reach + 0.001);
  float on = min(burn * 3.0, 1.0);
  float black = (1.0 - smoothstep(0.4, 0.5, s)) * on;
  float ember = smoothstep(0.38, 0.5, s) * (1.0 - smoothstep(0.5, 0.75, s)) * on;
  float leak = 1.0 - smoothstep(0.7, 3.0, s);
  // Exposição desigual: pisca no tempo e varia pelo quadro.
  float expo = 1.0 + (vnoise(vec2(time * 7.0, 0.5)) - 0.5) * 0.45 * flick;
  expo *= 1.0 + (vnoise(p * 1.5 + time * 0.6) - 0.5) * 0.35 * flick;
  vec3 col = sCurve(c.rgb * expo * vec3(1.06, 0.98, 0.86), 0.3);
  col += leak * vec3(0.45, 0.16, 0.02) * burn;
  col = mix(col, vec3(1.0, 0.5, 0.1) * (1.1 + 0.3 * n), ember);
  col = mix(col, vec3(0.03, 0.015, 0.005), black);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
