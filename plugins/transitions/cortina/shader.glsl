// Baseado em "directionalwipe" do gl-transitions (MIT)
vec4 transition(vec2 uv) {
  vec2 v = length(direction) > 0.0 ? normalize(direction) : vec2(1.0, 0.0);
  v /= abs(v.x) + abs(v.y);
  float d = v.x * 0.5 + v.y * 0.5;
  float m = (1.0 - step(progress, 0.0)) *
    (1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness))));
  return mix(getFromColor(uv), getToColor(uv), m);
}
