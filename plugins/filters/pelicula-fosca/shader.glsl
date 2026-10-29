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

/** Onde a cor parece pele (matiz entre o vermelho e o amarelo, saturação moderada). */
float skinMask(vec3 c, float width) {
  vec3 h = rgb2hsv(c);
  return hueBand(h.x, 0.07, width) * smoothstep(0.08, 0.2, h.y) * (1.0 - smoothstep(0.65, 0.85, h.y)) * smoothstep(0.12, 0.3, h.z);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 hsv = rgb2hsv(c.rgb);
  float skin = skinMask(c.rgb, 0.09);
  float green = hueBand(hsv.x, 0.3, 0.14);
  hsv.x = fract(hsv.x + green * 0.035);
  hsv.y *= mix(sat, max(sat, 0.85), skin) * (1.0 - green * 0.2);
  vec3 col = hsv2rgb(hsv);
  col = sCurve(mix(vec3(0.5), col, 0.86), 0.25);
  col += vec3(-0.005, 0.0, 0.01) * smoothstep(0.6, 1.0, luma(col));
  col = col * (1.0 - 0.1 * lift) + vec3(0.085, 0.095, 0.1) * lift;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
