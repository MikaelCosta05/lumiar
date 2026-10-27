float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb * (1.0 - 0.2 * amount);
  vec2 p = uv * vec2(ratio, 1.0);
  float rain = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = p * vec2(70.0 + fi * 40.0, 4.0 + fi * 2.0);
    q.y += time * (8.0 + fi * 4.0) * speed;
    q.x += q.y * slant;
    vec2 id = floor(q);
    float fy = fract(q.y);
    float drop = step(0.93, hash(id + fi * 17.0));
    float streak = smoothstep(0.0, 0.25, fy) * (1.0 - smoothstep(0.25, 0.9, fy));
    float xm = 1.0 - smoothstep(0.05, 0.3, abs(fract(q.x) - 0.5));
    rain += drop * streak * xm * (1.0 - fi * 0.25);
  }
  return vec4(c + vec3(0.75, 0.85, 1.0) * rain * amount, 1.0);
}
