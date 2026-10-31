// Cortina (wipe direcional), a partir do "directionalwipe" do gl-transitions (MIT): a linha atravessa com
// aceleração (ease in-out cúbica) e a borda suave mistura os clipes em luz linear (sem faixa escura na borda).
vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 v = length(direction) > 0.0 ? normalize(direction) : vec2(1.0, 0.0);
  v /= abs(v.x) + abs(v.y);
  float d = v.x * 0.5 + v.y * 0.5;
  float e = lmEaseInOutCubic(progress);
  float x = v.x * uv.x + v.y * uv.y - (d - 0.5 + e * (1.0 + smoothness));
  // Borda: a suavidade de projeto ou, no mínimo, 1 pixel (sem serrilhado na diagonal).
  float soft = max(smoothness, fwidth(x) * 1.5);
  float m = 1.0 - smoothstep(-soft, 0.0, x);
  vec4 a = getFromColor(uv);
  vec4 b = getToColor(uv);
  return vec4(lmToSrgb(mix(lmToLinear(a.rgb), lmToLinear(b.rgb), m)), mix(a.a, b.a, m));
}
