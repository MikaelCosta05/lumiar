// Barras de cinema (letterbox). A borda da barra cai no meio de um pixel sem serrilhar: a cobertura de cada pixel é
// calculada na hora (meio pixel suavizado), então a proporção pode ser animada sem a linha "pular".
vec4 effect(vec2 uv) {
  // Em vídeo vertical, as barras ficam com a mesma espessura que teriam num 16:9
  // (senão o 2.39:1 viraria uma tirinha no meio da tela).
  float frame = max(ratio, 16.0 / 9.0);
  float visible = clamp(frame / aspect, 0.0, 1.0);
  float bar = (1.0 - visible) * 0.5;
  // Distância (em pixels) até a borda da barra mais próxima: positiva dentro da imagem.
  float d = min(uv.y - bar, 1.0 - bar - uv.y) * resolution.y;
  float inside = clamp(d + 0.5, 0.0, 1.0);
  return mix(vec4(tint, 1.0), getColor(uv), inside);
}
