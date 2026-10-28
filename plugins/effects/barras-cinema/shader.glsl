vec4 effect(vec2 uv) {
  // Em vídeo vertical, as barras ficam com a mesma espessura que teriam num 16:9
  // (senão o 2.39:1 viraria uma tirinha no meio da tela).
  float frame = max(ratio, 16.0 / 9.0);
  float visible = clamp(frame / aspect, 0.0, 1.0);
  float bar = (1.0 - visible) * 0.5;
  return (uv.y < bar || uv.y > 1.0 - bar) ? vec4(tint, 1.0) : getColor(uv);
}
