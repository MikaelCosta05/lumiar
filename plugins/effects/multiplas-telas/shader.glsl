// Várias telas: o vídeo inteiro cabe em cada quadro da grade (encolhido, não cortado), com o espaço entre eles
// em px de um vídeo 1080p e a borda de cada quadro antisserrilhada.
vec4 effect(vec2 uv) {
  float g = max(1.0, floor(grid + 0.5));
  vec2 cellPx = resolution / g;
  vec2 pp = fract(uv * g) * cellPx;                 // pixel dentro do quadro
  float halfGap = gap * 0.5 * resolution.y / 720.0; // px de 720p, como antes (o mesmo valor dá o mesmo vão)
  vec2 inner = max(cellPx - 2.0 * halfGap, vec2(1.0));
  vec2 local = clamp((pp - halfGap) / inner, 0.0, 1.0);
  float sd = lmSdBox(pp - cellPx * 0.5, inner * 0.5);
  float cover = halfGap > 0.0 ? clamp(0.5 - sd, 0.0, 1.0) : 1.0;
  return mix(vec4(tint, 1.0), getColor(local), cover);
}
