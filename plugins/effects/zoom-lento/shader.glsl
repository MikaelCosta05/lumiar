// Zoom lento (Ken Burns): a aproximação começa e termina devagar (ease in-out) e anda em escala geométrica (cada
// segundo aproxima a mesma proporção, sem parecer acelerar no fim, como no zoom de uma lente de verdade).
vec4 effect(vec2 uv) {
  float k = lmEaseInOutSine(clamp(time / max(duration, 0.001), 0.0, 1.0));
  float zs = max(zoomStart, 1e-3);
  float zoom = zs * pow(max(zoomEnd, 1e-3) / zs, k);
  return getColor((uv - center) / zoom + center);
}
