vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  vec2 aspect = vec2(ratio, 1.0);
  vec3 leak = tint * (1.0 - smoothstep(0.0, 0.9, length((uv - vec2(-0.2 + progress * 1.4, 0.7)) * aspect)));
  leak += vec3(1.0, 0.25, 0.4) * (1.0 - smoothstep(0.0, 0.6, length((uv - vec2(1.2 - progress * 1.4, 0.25)) * aspect))) * 0.7;
  vec3 col = mix(getFromColor(uv).rgb, getToColor(uv).rgb, smoothstep(0.3, 0.7, progress));
  col = 1.0 - (1.0 - col) * (1.0 - clamp(leak * s * 1.3, 0.0, 1.0));
  return vec4(col, 1.0);
}
