float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

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
  vec2 p = uv * vec2(ratio, 1.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = p * (3.0 + fi * 2.5) + vec2(fi * 7.3, -time * speed * (0.3 + fi * 0.15));
    vec2 id = floor(q);
    vec2 o = (hash2(id) - 0.5) * 0.6;
    float rad = (0.15 + 0.2 * hash(id + 4.0)) * size;
    float d = length(fract(q) - 0.5 - o);
    float blob = (1.0 - smoothstep(rad * 0.6, rad, d)) * step(0.55, hash(id + 2.0));
    vec3 tint = hsv2rgb(vec3(fract(hue + hash(id + 8.0) * 0.15), 0.55, 1.0));
    acc += tint * blob * (0.35 - fi * 0.08) * (0.6 + 0.4 * sin(time * 2.0 + hash(id) * 6.28));
  }
  return vec4(c + acc * amount, 1.0);
}
