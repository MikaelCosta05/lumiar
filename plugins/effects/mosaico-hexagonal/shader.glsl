// Mosaico hexagonal (colmeia de pastilhas).
// - Cada pastilha tem a cor média da imagem dentro dela (nível de detalhe do tamanho da pastilha).
// - O rejunte é uma distância de hexágono com espessura fixa e borda antisserrilhada pela derivada do pixel.
// - Cada pastilha tem um chanfro discreto iluminado de cima à esquerda, para ler como peça, não como filtro.
// Tamanho relativo a um vídeo 720p, como antes; "Contorno" escurece o rejunte (0 = sem rejunte).
vec4 effect(vec2 uv) {
  float cellPx = size * resolution.y / 720.0;
  vec2 p = uv * resolution / cellPx;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 centerUv = (p - g) * cellPx / resolution;
  vec3 c = getColorLod(centerUv, max(log2(cellPx * 0.6), 0.0)).rgb;

  // Distância até a borda do hexágono (0,5 = borda), contínua dentro da pastilha.
  vec2 ag = abs(g);
  float hd = max(dot(ag, normalize(r)), ag.x);
  float edge = 0.5 - hd;                           // > 0 dentro
  float aa = max(fwidth(hd), 1e-4);
  float grout = 0.05;                              // meia espessura do rejunte, em unidades de pastilha
  float tile = smoothstep(grout - aa, grout + aa, edge);
  // Chanfro: perto da borda, a pastilha inclina para fora; a luz vem de cima à esquerda.
  float bevel = 1.0 - smoothstep(grout, grout + 0.09, edge);
  float facing = dot(normalize(g + 1e-5), normalize(vec2(-0.6, 0.8)));
  vec3 lit = c * (1.0 + bevel * facing * 0.18);
  vec3 groutColor = c * (1.0 - gap);
  return vec4(mix(groutColor, clamp(lit, 0.0, 1.0), mix(1.0, tile, step(0.001, gap))), 1.0);
}
