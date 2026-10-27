float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Cada caractere é um bitmap 5x5 guardado num inteiro.
float character(int n, vec2 p) {
  p = floor(p * vec2(-4.0, 4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    int a = int(round(p.x) + 5.0 * round(p.y));
    if (((n >> a) & 1) == 1) return 1.0;
  }
  return 0.0;
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  float cs = max(6.0, size * k);
  vec2 pix = uv * resolution;
  vec2 cell = floor(pix / cs) * cs + cs * 0.5;
  vec3 col = getColor(cell / resolution).rgb;
  float gray = luma(col);
  int n = 4096;
  if (gray > 0.2) n = 65600;
  if (gray > 0.3) n = 332772;
  if (gray > 0.4) n = 15255086;
  if (gray > 0.5) n = 23385164;
  if (gray > 0.6) n = 15252014;
  if (gray > 0.7) n = 13199452;
  if (gray > 0.8) n = 11512810;
  vec2 p = mod(pix / (cs * 0.5), 2.0) - vec2(1.0);
  vec3 ink = mix(vec3(0.25, 1.0, 0.45), col * 1.3, colorful);
  return vec4(ink * character(n, p), 1.0);
}
