vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  // 0 no centro, 1 nos cantos
  float d = length(p) / length(vec2(ratio, 1.0) * 0.5);
  float v = smoothstep(size, size + softness, d);
  return vec4(mix(c.rgb, tint, v * intensity), c.a);
}
