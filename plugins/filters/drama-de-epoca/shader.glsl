float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
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
  float green = hueBand(hsv.x, 0.3, 0.15);
  float blue = hueBand(hsv.x, 0.6, 0.15);
  hsv.x = fract(hsv.x - green * 0.06);
  hsv.y *= 1.0 - green * 0.45 - blue * 0.5;
  vec3 col = hsv2rgb(hsv);
  float l = luma(col);
  col *= mix(vec3(1.0), vec3(1.1, 0.98, 0.78), candle * smoothstep(0.15, 0.85, l));
  col = sCurve(col, 0.2);
  col = col * (1.0 - 0.09 * lift) + vec3(0.09, 0.07, 0.05) * lift;
  col *= mix(1.0, vignette(uv, 1.1), vig);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
