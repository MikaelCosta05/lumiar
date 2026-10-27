vec4 blurFrom(vec2 uv, float r) {
  vec4 s = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.399;
    s += getFromColor(uv + vec2(cos(a), sin(a)) * sqrt(float(i) / 16.0) * r / vec2(ratio, 1.0));
  }
  return s / 16.0;
}

vec4 blurTo(vec2 uv, float r) {
  vec4 s = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 2.399;
    s += getToColor(uv + vec2(cos(a), sin(a)) * sqrt(float(i) / 16.0) * r / vec2(ratio, 1.0));
  }
  return s / 16.0;
}

vec4 transition(vec2 uv) {
  float r = sin(progress * PI) * 0.03 * strength;
  return mix(blurFrom(uv, r), blurTo(uv, r), smoothstep(0.2, 0.8, progress));
}
