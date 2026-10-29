float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

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
  // A película dança um pouco na janela do projetor.
  vec2 off = (vec2(vnoise(vec2(time * 7.0, 1.3)), vnoise(vec2(3.7, time * 6.0))) - 0.5) * weave * vec2(0.004, 0.006);
  vec2 q = uv + off;
  vec2 px = 0.75 * (resolution.y / 720.0) / resolution;
  vec3 s = getColor(q).rgb * 0.5 + (getColor(q + vec2(px.x, 0.0)).rgb + getColor(q - vec2(px.x, 0.0)).rgb
    + getColor(q + vec2(0.0, px.y)).rgb + getColor(q - vec2(0.0, px.y)).rgb) * 0.125;
  vec3 col = saturate(s * vec3(1.04, 1.0, 0.92), 0.82);
  col = sCurve(col * 0.92 + 0.05, 0.35);
  float l = luma(col);
  col += mix(vec3(0.0, 0.015, 0.01), vec3(0.02, 0.0, -0.015), l);
  col *= 1.0 + (vnoise(vec2(time * 12.0, 5.0)) - 0.5) * 0.06;
  float g = grainAt(uv, 2.0) * 0.7 + grainAt(uv + 0.37, 1.0) * 0.3;
  col += g * grain * 0.14 * (0.4 + 3.0 * l * (1.0 - l));
  col *= vignette(uv, 0.45);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
