vec4 transition(vec2 uv) {
  if (progress < 0.6) {
    float p = progress / 0.6;
    float z = 1.0 + 0.45 * p * p * p * strength;
    return getFromColor((uv - 0.5) / z + 0.5);
  }
  float p = (progress - 0.6) / 0.4;
  float z = 1.0 + 0.3 * (1.0 - p) * (1.0 - p) * strength;
  return getToColor((uv - 0.5) / z + 0.5);
}
