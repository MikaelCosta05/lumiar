mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec4 effect(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - center) * aspect;
  float k = clamp(1.0 - length(p) / radius, 0.0, 1.0);
  p = rot(k * k * (strength + time * speed)) * p;
  return getColor(p / aspect + center);
}
