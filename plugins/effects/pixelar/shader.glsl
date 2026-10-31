// Pixelar (mosaico): cada bloco mostra a MÉDIA da imagem dentro dele (quatro leituras de um nível de detalhe com
// metade do tamanho do bloco), não um pixel solto do centro: os blocos não piscam quando a imagem se mexe.
// A grade parte do centro do quadro (fica simétrica) e o tamanho é em px de um vídeo 1080p.
vec4 effect(vec2 uv) {
  float bs = max(size, 1.0) * resolution.y / 1080.0;     // tamanho do bloco em pixels da tela
  if (bs <= 1.0) return getColor(uv);
  vec2 p = (uv - 0.5) * resolution / bs;
  vec2 center = (floor(p) + 0.5) * bs / resolution + 0.5;
  float lod = max(log2(bs * 0.5), 0.0);
  vec2 q = vec2(bs * 0.25) / resolution;
  vec4 c = getColorLod(center + vec2(-q.x, -q.y), lod) + getColorLod(center + vec2(q.x, -q.y), lod)
         + getColorLod(center + vec2(-q.x, q.y), lod) + getColorLod(center + vec2(q.x, q.y), lod);
  return c * 0.25;
}
