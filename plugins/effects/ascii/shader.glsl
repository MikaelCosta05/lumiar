// Arte ASCII: cada célula vira um caractere 5×5 escolhido pela luminância média da célula.
// - A cor da célula é a média da imagem dentro dela (nível de detalhe), não um pixel solto: os caracteres não
//   piscam quando a imagem se mexe.
// - Cada caractere é desenhado com a cobertura exata do pixel (filtro de caixa sobre o bitmap): os "pixels" das
//   letras ficam do mesmo tamanho em toda a tela e sem serrilhado, em qualquer tamanho.
// - O brilho do traço acompanha um pouco o tom (a imagem se lê melhor), como num terminal de fósforo.
// Tamanho relativo a um vídeo 720p, como antes.

/** Bit (0 ou 1) do bitmap 5×5 na coluna i (da esquerda) e linha j (de baixo). */
float bitAt(int n, vec2 ij) {
  if (ij.x < 0.0 || ij.y < 0.0 || ij.x > 4.0 || ij.y > 4.0) return 0.0;
  int a = (4 - int(ij.x)) + 5 * int(ij.y);
  return float((n >> a) & 1);
}

/** Cobertura do caractere no pixel: g = posição no bitmap, w = tamanho do pixel no bitmap. */
float glyph(int n, vec2 g, vec2 w) {
  w = clamp(w, vec2(1e-3), vec2(1.0));
  vec2 lo = g - 0.5 * w;
  vec2 i0 = floor(lo);
  vec2 ov0 = clamp(i0 + 1.0 - lo, vec2(0.0), w);
  vec2 ov1 = w - ov0;
  float s = bitAt(n, i0) * ov0.x * ov0.y + bitAt(n, i0 + vec2(1.0, 0.0)) * ov1.x * ov0.y
          + bitAt(n, i0 + vec2(0.0, 1.0)) * ov0.x * ov1.y + bitAt(n, i0 + vec2(1.0, 1.0)) * ov1.x * ov1.y;
  return s / (w.x * w.y);
}

vec4 effect(vec2 uv) {
  float cs = max(6.0, size * resolution.y / 720.0);    // célula em pixels da tela
  vec2 pix = uv * resolution;
  vec2 cell = floor(pix / cs);
  vec2 f = pix / cs - cell;
  vec2 center = (cell + 0.5) * cs / resolution;
  vec3 col = getColorLod(center, max(log2(cs * 0.6), 0.0)).rgb;
  float gray = lmLuma(col);
  int n = 4096;
  if (gray > 0.2) n = 65600;
  if (gray > 0.3) n = 332772;
  if (gray > 0.4) n = 15255086;
  if (gray > 0.5) n = 23385164;
  if (gray > 0.6) n = 15252014;
  if (gray > 0.7) n = 13199452;
  if (gray > 0.8) n = 11512810;
  // O bitmap ocupa o miolo da célula (5 de 6,4 partes), com o espaço entre letras.
  const float SPAN = 6.4;
  vec2 g = (f - 0.5) * SPAN + 2.5;
  vec2 w = vec2(SPAN / cs);
  float cover = glyph(n, g, w);
  vec3 ink = mix(vec3(0.25, 1.0, 0.45), clamp(col * 1.3, 0.0, 1.0), colorful);
  float level = 0.6 + 0.4 * smoothstep(0.1, 0.9, gray);
  return vec4(ink * cover * level, 1.0);
}
