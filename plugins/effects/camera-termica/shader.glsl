float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 heat(float t) {
  vec3 c[6] = vec3[6](vec3(0.0, 0.0, 0.08), vec3(0.25, 0.0, 0.55), vec3(0.85, 0.0, 0.45), vec3(1.0, 0.45, 0.0), vec3(1.0, 0.9, 0.2), vec3(1.0));
  float x = clamp(t, 0.0, 1.0) * 5.0;
  int i = int(min(floor(x), 4.0));
  return mix(c[i], c[i + 1], x - float(i));
}

vec4 effect(vec2 uv) {
  float l = luma(getColor(uv).rgb);
  return vec4(heat((l - 0.5) * contrast + 0.5), 1.0);
}
