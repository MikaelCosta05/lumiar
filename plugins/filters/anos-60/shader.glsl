float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-6)), d / (q.x + 1.0e-6), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

/** 1 perto do matiz `center` (0 a 1, dá a volta), 0 a partir de `width` de distância. */
float hueBand(float h, float center, float width) {
  float d = abs(fract(h - center + 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.5, width, d);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 hsv = rgb2hsv(c.rgb);
  float blue = hueBand(hsv.x, 0.62, 0.16);
  float red = hueBand(hsv.x, 0.0, 0.1);
  float green = hueBand(hsv.x, 0.3, 0.12);
  // Azuis puxam para o ciano, verdes para o amarelo, vermelhos mais fortes.
  hsv.x = fract(hsv.x - blue * 0.045 - green * 0.03);
  hsv.y = clamp(hsv.y * (satAmt + red * 0.25), 0.0, 1.0);
  vec3 col = sCurve(hsv2rgb(hsv), 0.3);
  col = mix(col, col * vec3(0.98, 0.95, 0.86) + vec3(0.06, 0.05, 0.06), fade);
  col += vec3(0.0, 0.0, 0.02) * (1.0 - luma(col)) * fade;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
