float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
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
  float skyBlue = hueBand(hsv.x, 0.58, 0.14) * smoothstep(0.1, 0.3, hsv.y) * smoothstep(0.3, 0.6, hsv.z);
  float foliage = hueBand(hsv.x, 0.27, 0.14) * smoothstep(0.1, 0.25, hsv.y);
  hsv.z *= 1.0 - skyBlue * 0.28 * sky - foliage * 0.06 * glare;
  hsv.y = clamp(hsv.y * (1.0 + skyBlue * 0.45 * sky + foliage * 0.3 * glare), 0.0, 1.0);
  vec3 col = hsv2rgb(hsv);
  // Brilho branco sobre superfícies coloridas (reflexo): some e a cor de baixo aparece.
  float spec = smoothstep(0.75, 1.0, luma(col)) * (1.0 - smoothstep(0.08, 0.25, hsv.y));
  col = mix(col, saturate(col, 1.6) * 0.9, spec * glare * 0.7);
  col = saturate(col, 1.08);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
