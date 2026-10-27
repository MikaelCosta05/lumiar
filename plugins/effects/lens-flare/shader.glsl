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

vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 L = (source - 0.5) * aspect;
  float d = length(p - L);
  vec3 flare = vec3(1.0, 0.85, 0.6) * (0.02 / (d + 0.02)) * 0.8;
  flare += vec3(1.0, 0.7, 0.4) * pow(max(0.0, 1.0 - d), 6.0) * 0.4;
  flare += vec3(0.6, 0.7, 1.0) * exp(-abs(p.y - L.y) * 60.0) * exp(-abs(p.x - L.x) * 2.0) * 0.4;
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    float gd = length(p + L * 0.3 * fi);
    float gsize = 0.03 + 0.03 * fi;
    flare += hsv2rgb(vec3(fi * 0.18, 0.6, 1.0)) * (1.0 - smoothstep(gsize * 0.7, gsize, gd)) * 0.12;
  }
  return vec4(c + flare * amount, 1.0);
}
