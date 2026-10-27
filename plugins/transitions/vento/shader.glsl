float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Baseado em "wind" do gl-transitions (MIT)
vec4 transition(vec2 uv) {
  float r = hash(vec2(0.0, uv.y * 300.0));
  float x = uv.x * (1.0 - size) + size * r - progress * (1.0 + size);
  float m = 1.0 - smoothstep(-size, 0.0, x);
  return mix(getFromColor(uv), getToColor(uv), m);
}
