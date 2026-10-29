const vec3 PALETTE[16] = vec3[16](
  vec3(0.0), vec3(1.0), vec3(0.55, 0.16, 0.13), vec3(0.4, 0.75, 0.78),
  vec3(0.55, 0.25, 0.62), vec3(0.33, 0.63, 0.25), vec3(0.2, 0.18, 0.6), vec3(0.85, 0.85, 0.45),
  vec3(0.6, 0.35, 0.12), vec3(0.32, 0.25, 0.0), vec3(0.8, 0.45, 0.4), vec3(0.25),
  vec3(0.45), vec3(0.6, 0.9, 0.5), vec3(0.45, 0.4, 0.85), vec3(0.68)
);

/** Matriz de Bayer 4x4 (0 a 15/16), montada a partir da 2x2. */
float bayer4(vec2 p) {
  vec2 a = mod(p, 2.0);
  vec2 b = mod(floor(p / 2.0), 2.0);
  float m1 = a.x * 2.0 + a.y * 3.0 - a.x * a.y * 4.0;
  float m2 = b.x * 2.0 + b.y * 3.0 - b.x * b.y * 4.0;
  return (m1 * 4.0 + m2) / 16.0;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float cellPx = max(pix * resolution.y / 720.0, 1.0);
  vec2 cell = floor(uv * resolution / cellPx);
  vec3 s = getColor((cell + 0.5) * cellPx / resolution).rgb;
  s += (bayer4(cell) - 0.47) * 0.25 * dith;
  vec3 best = PALETTE[0];
  float bestD = 1.0e9;
  for (int i = 0; i < 16; i++) {
    vec3 d = (s - PALETTE[i]) * vec3(0.6, 1.0, 0.4);
    float dd = dot(d, d);
    if (dd < bestD) {
      bestD = dd;
      best = PALETTE[i];
    }
  }
  return vec4(best, c.a);
}
