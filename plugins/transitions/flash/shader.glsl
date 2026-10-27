vec4 transition(vec2 uv) {
  float f = 1.0 - abs(progress - 0.5) * 2.0;
  float glow = pow(f, 3.0) * brightness;
  vec4 c = mix(getFromColor(uv), getToColor(uv), smoothstep(0.45, 0.55, progress));
  return vec4(mix(c.rgb, tint, clamp(glow, 0.0, 1.0)), 1.0);
}
