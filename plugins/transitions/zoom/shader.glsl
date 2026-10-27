vec4 zoomFrom(vec2 uv, float scale, float blur) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float k = float(i) / 11.0;
    sum += getFromColor((uv - 0.5) * scale * (1.0 - blur * k) + 0.5);
  }
  return sum / 12.0;
}

vec4 zoomTo(vec2 uv, float scale, float blur) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float k = float(i) / 11.0;
    sum += getToColor((uv - 0.5) * scale * (1.0 - blur * k) + 0.5);
  }
  return sum / 12.0;
}

vec4 transition(vec2 uv) {
  float blur = strength * 0.2 * sin(progress * PI);
  vec4 a = zoomFrom(uv, 1.0 - strength * 0.6 * progress, blur);
  vec4 b = zoomTo(uv, 1.0 / (1.0 + strength * (1.0 - progress)), blur);
  return mix(a, b, smoothstep(0.35, 0.65, progress));
}
