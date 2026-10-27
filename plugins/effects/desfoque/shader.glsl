vec4 effect(vec2 uv) {
  if (radius < 0.01) return getColor(uv);
  vec2 px = radius / resolution;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      vec2 o = vec2(float(x), float(y)) / 4.0;
      float w = exp(-dot(o, o) * 2.0);
      sum += getColor(uv + o * px) * w;
      total += w;
    }
  }
  return sum / total;
}
