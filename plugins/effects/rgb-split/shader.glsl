vec4 effect(vec2 uv) {
  float a = radians(angle);
  vec2 offset = vec2(cos(a), sin(a) * ratio) * amount;
  vec4 c = getColor(uv);
  c.r = getColor(uv + offset).r;
  c.b = getColor(uv - offset).b;
  return c;
}
