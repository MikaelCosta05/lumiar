float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  vec2 p = uv * vec2(ratio, 1.0);
  float snow = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = p * (8.0 + fi * 6.0);
    q.y += time * speed * (1.0 + fi * 0.4);
    q.x += sin(q.y * 0.5 + fi * 3.0 + time) * 0.5;
    vec2 id = floor(q);
    vec2 o = hash2(id) - 0.5;
    float d = length(fract(q) - 0.5 - o * 0.7);
    float flake = (0.06 + 0.06 * hash(id + 3.0)) * size;
    snow += (1.0 - smoothstep(flake * 0.5, flake, d)) * step(0.4, hash(id + 9.1)) * (1.0 - fi * 0.15);
  }
  return vec4(c + vec3(snow) * amount, 1.0);
}
