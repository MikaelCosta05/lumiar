vec4 effect(vec2 uv) {
  float beat = fract(time * bpm / 60.0);
  float pulse = exp(-beat * 6.0);
  vec2 p = (uv - 0.5) / (1.0 + amount * pulse) + 0.5;
  vec4 c = getColor(p);
  c.rgb += pulse * flash * 0.3;
  return c;
}
