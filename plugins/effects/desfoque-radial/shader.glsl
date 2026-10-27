vec4 effect(vec2 uv) {
  vec2 dir = uv - center;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    float k = float(i) / 23.0;
    sum += getColor(center + dir * (1.0 - strength * 0.25 * k));
  }
  return sum / 24.0;
}
