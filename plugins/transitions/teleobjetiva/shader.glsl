vec4 zoomFrom(vec2 uv, float blur) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 10; i++) sum += getFromColor(0.5 + (uv - 0.5) * (1.0 - blur * float(i) / 9.0));
  return sum / 10.0;
}

vec4 zoomTo(vec2 uv, float blur) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 10; i++) sum += getToColor(0.5 + (uv - 0.5) * (1.0 - blur * float(i) / 9.0));
  return sum / 10.0;
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float z = progress < 0.5 ? 1.0 + progress * 2.0 * strength : 1.0 + (1.0 - progress) * 2.0 * strength;
  vec2 q = (uv - 0.5) / z + 0.5;
  float blur = s * 0.12;
  return mix(zoomFrom(q, blur), zoomTo(q, blur), smoothstep(0.45, 0.55, progress));
}
