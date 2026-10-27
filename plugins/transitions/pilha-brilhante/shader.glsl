vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  vec4 base = mix(getFromColor(uv), getToColor(uv), smoothstep(0.4, 0.6, progress));
  vec3 acc = vec3(0.0);
  for (int i = 1; i <= 5; i++) {
    float k = float(i);
    vec2 q = (uv - 0.5) * (1.0 + k * 0.18 * s) + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
    acc += (progress < 0.5 ? getFromColor(q).rgb : getToColor(q).rgb) * (0.35 / k);
  }
  return vec4(base.rgb * (1.0 - 0.3 * s) + acc * s * glow, 1.0);
}
