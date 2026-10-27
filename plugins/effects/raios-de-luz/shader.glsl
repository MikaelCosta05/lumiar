float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  vec3 base = getColor(uv).rgb;
  vec2 delta = (uv - source) * spread / 40.0;
  vec2 q = uv;
  float decay = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    q -= delta;
    vec3 s = getColor(q).rgb;
    acc += s * smoothstep(threshold, 1.0, luma(s)) * decay;
    decay *= 0.96;
  }
  return vec4(base + acc / 40.0 * amount * 3.0, 1.0);
}
