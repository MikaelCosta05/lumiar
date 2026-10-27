vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec2 px = radius / resolution;
  vec3 glow = vec3(0.0);
  float total = 0.0;
  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      vec2 o = vec2(float(x), float(y)) / 3.0;
      float w = exp(-dot(o, o) * 2.0);
      vec3 c = getColor(uv + o * px).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      glow += c * smoothstep(threshold, 1.0, l) * w;
      total += w;
    }
  }
  return vec4(base.rgb + glow / total * intensity * 2.0, base.a);
}
