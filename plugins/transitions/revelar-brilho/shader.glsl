float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 transition(vec2 uv) {
  float l = luma(getFromColor(uv).rgb);
  l = mix(l, 1.0 - l, step(0.5, invert));
  float e = progress * (1.0 + smoothness);
  float m = 1.0 - smoothstep(e - smoothness, e, l);
  return mix(getFromColor(uv), getToColor(uv), m);
}
