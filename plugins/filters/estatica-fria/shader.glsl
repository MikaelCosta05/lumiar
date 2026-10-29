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

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  float frame = floor(time * 30.0);
  float row = floor(uv.y * resolution.y / (3.0 * k));
  // Quando o sinal cai, as linhas escorregam para os lados.
  float drop = smoothstep(0.55, 0.85, vnoise(vec2(time * 1.7, 4.0))) * weak;
  vec3 base = getColor(vec2(uv.x + (hash(vec2(row, frame)) - 0.5) * 0.02 * drop, uv.y)).rgb;
  vec3 col = saturate(base, 0.25) * vec3(0.82, 0.95, 1.12);
  col = mix(vec3(0.45), col, 0.85);
  float n = hash(floor(uv * resolution / (1.5 * k)) + frame * vec2(17.3, 9.1));
  col = mix(col, vec3(n) * vec3(0.85, 0.95, 1.05), hiss * 0.28 + drop * 0.65);
  float line = step(0.985 - weak * 0.02, hash(vec2(row, frame + 3.0)));
  col = mix(col, vec3(0.9, 0.95, 1.0) * (0.6 + 0.4 * n), line * 0.6 * (0.5 + 0.5 * hiss));
  col *= 0.95 + 0.05 * sin(uv.y * resolution.y * PI / (1.5 * k));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
