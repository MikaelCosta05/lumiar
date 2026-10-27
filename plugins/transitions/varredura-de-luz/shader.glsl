vec4 transition(vec2 uv) {
  float c = uv.x + uv.y * 0.5;
  float pos = progress * 2.1 - 0.3;
  float m = 1.0 - smoothstep(pos - 0.05, pos + 0.05, c);
  float glow = exp(-pow((c - pos) * 5.0, 2.0)) * sin(progress * PI) * intensity;
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  return vec4(col.rgb + tint * glow, 1.0);
}
