float pulse(float center) {
  return exp(-pow((progress - center) * 14.0, 2.0));
}

vec4 transition(vec2 uv) {
  float beat = pulse(0.22) + pulse(0.52) * 1.3;
  vec2 q = (uv - 0.5) / (1.0 + beat * 0.15 * strength) + 0.5;
  vec4 col = progress < 0.5 ? getFromColor(q) : getToColor(q);
  float v = length(uv - 0.5);
  col.rgb *= 1.0 - beat * 0.35 * smoothstep(0.2, 0.75, v);
  col.rgb += vec3(0.6, 0.0, 0.05) * beat * 0.15 * smoothstep(0.3, 0.8, v);
  return vec4(col.rgb, 1.0);
}
