vec4 effect(vec2 uv) {
  float visible = clamp(ratio / aspect, 0.0, 1.0);
  float bar = (1.0 - visible) * 0.5;
  return (uv.y < bar || uv.y > 1.0 - bar) ? vec4(tint, 1.0) : getColor(uv);
}
