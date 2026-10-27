float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float l = clamp((luma(c.rgb) - 0.5) * contrast + 0.5, 0.0, 1.0);
  return vec4(mix(dark, light, l), c.a);
}
