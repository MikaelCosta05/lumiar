float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float r = rand(floor(uv * vec2(size * ratio, size)));
  float m = 1.0 - smoothstep(-smoothness, 0.0, r - progress * (1.0 + smoothness));
  return mix(getFromColor(uv), getToColor(uv), m);
}
