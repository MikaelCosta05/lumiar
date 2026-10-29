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

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec3 col = saturate(c.rgb, 0.4) * vec3(0.95, 1.0, 0.93);
  col = col * 0.88 + vec3(0.04, 0.045, 0.035);
  // Manchas: miolo escuro esverdeado e uma borda clara de poeira.
  vec2 p = uv * vec2(ratio, 1.0) * mix(7.0, 2.5, spot);
  // O contorno torto vem de um ruído deslocado por outro (as colônias não são redondas).
  vec2 warp = vec2(vnoise(p * 1.7 + 3.0), vnoise(p * 1.7 + 9.0)) - 0.5;
  float n = fbm(p + warp * 0.9 + vec2(0.0, time * 0.015));
  float t = 0.76 - mold * 0.22;
  float m = smoothstep(t, t + 0.12, n);
  float rim = smoothstep(t - 0.04, t, n) * (1.0 - smoothstep(t, t + 0.03, n));
  // Dentro da mancha a sujeira não é lisa: textura fina, mais escura no miolo.
  float grime = 0.55 + 0.45 * vnoise(uv * resolution / (3.0 * k));
  col = mix(col, col * 0.35 * grime + vec3(0.04, 0.05, 0.025), m * 0.85);
  col += rim * vec3(0.07, 0.08, 0.05) * mold;
  float dots = step(1.0 - 0.012 * mold, hash(floor(uv * resolution / (2.0 * k))));
  col = mix(col, vec3(0.12, 0.13, 0.08), dots * 0.7);
  // Falha de sinal: um risco claro e curto que aparece num quadro e some.
  float frame = floor(time * 24.0);
  float row = floor(uv.y * resolution.y / (2.0 * k));
  float x0 = hash(vec2(row * 3.1, frame));
  float drop = step(0.993, hash(vec2(row, frame))) * step(x0, uv.x) * step(uv.x, x0 + 0.25);
  col = mix(col, vec3(0.85), drop * 0.7 * mold);
  col *= 1.0 + (vnoise(vec2(time * 9.0, 2.0)) - 0.5) * 0.08;
  col *= vignette(uv, 0.5);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
