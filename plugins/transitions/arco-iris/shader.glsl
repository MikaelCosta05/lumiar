vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 transition(vec2 uv) {
  float c = uv.x + (uv.y - 0.5) * 0.3;
  float e = progress * (1.3 + 2.0 * width) - 0.15 - width;
  if (c < e - width) return getToColor(uv);
  if (c > e + width) return getFromColor(uv);
  float k = (c - (e - width)) / (2.0 * width);
  vec3 base = mix(getToColor(uv).rgb, getFromColor(uv).rgb, k);
  return vec4(mix(base, hsv2rgb(vec3(k * 0.8, 0.75, 1.0)), 0.65), 1.0);
}
