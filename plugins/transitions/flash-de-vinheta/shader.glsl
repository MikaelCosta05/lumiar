vec4 transition(vec2 uv) {
  float d = length((uv - 0.5) * vec2(ratio, 1.0));
  float close = 1.0 - abs(progress * 2.0 - 1.0);
  float radius = mix(1.6, 0.05, close);
  float v = 1.0 - smoothstep(radius - 0.25, radius, d);
  vec4 img = progress < 0.5 ? getFromColor(uv) : getToColor(uv);
  float flash = progress > 0.5 ? pow(1.0 - (progress - 0.5) * 2.0, 4.0) : 0.0;
  return vec4(mix(img.rgb * v, vec3(1.0), flash * 0.8), 1.0);
}
