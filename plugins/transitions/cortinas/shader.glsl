vec4 transition(vec2 uv) {
  float cover = 1.0 - abs(progress * 2.0 - 1.0);
  float e = cover * cover * (3.0 - 2.0 * cover);
  float edge = 0.5 * e;
  float d = uv.x < 0.5 ? uv.x : 1.0 - uv.x;
  if (d < edge) {
    float folds = 0.55 + 0.45 * sin((d / max(edge, 1e-3)) * 40.0);
    return vec4(tint * (0.45 + 0.4 * folds) * (0.7 + 0.3 * uv.y), 1.0);
  }
  return progress < 0.5 ? getFromColor(uv) : getToColor(uv);
}
