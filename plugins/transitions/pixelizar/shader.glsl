// Baseado em "pixelize" do gl-transitions (MIT)
vec4 transition(vec2 uv) {
  float d = min(progress, 1.0 - progress);
  float dist = steps > 0.0 ? ceil(d * steps) / steps : d;
  vec2 squareSize = 2.0 * dist / vec2(blocks * ratio, blocks);
  vec2 p = dist > 0.0 ? (floor(uv / squareSize) + 0.5) * squareSize : uv;
  return mix(getFromColor(p), getToColor(p), progress);
}
