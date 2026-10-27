mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float k = clamp(1.0 - length(p) / 0.9, 0.0, 1.0);
  vec2 q = rot(k * k * s * strength * 6.0) * p / aspect + 0.5;
  return mix(getFromColor(q), getToColor(q), smoothstep(0.35, 0.65, progress));
}
