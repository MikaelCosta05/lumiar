vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  vec2 p = uv * vec2(ratio, 1.0);
  float t = time * speed * 0.4;
  vec3 leak = vec3(0.0);
  leak += vec3(1.0, 0.42, 0.08) * (1.0 - smoothstep(0.0, 0.9, length(p - vec2(0.15 + 0.35 * sin(t), 0.85 + 0.25 * cos(t * 1.3)))));
  leak += vec3(1.0, 0.2, 0.45) * (1.0 - smoothstep(0.0, 0.7, length(p - vec2(ratio - 0.2 + 0.25 * cos(t * 0.8), 0.2 + 0.3 * sin(t * 1.1)))));
  leak += vec3(1.0, 0.85, 0.4) * 0.6 * (1.0 - smoothstep(0.0, 0.5, length(p - vec2(ratio * 0.5 + 0.6 * sin(t * 0.6), 0.5 + 0.4 * cos(t * 0.9)))));
  vec3 screenBlend = 1.0 - (1.0 - c) * (1.0 - clamp(leak * amount, 0.0, 1.0));
  return vec4(screenBlend, 1.0);
}
