// Rosto deformado: o rosto estica, a boca alarga, os traços escorrem e tudo dá trancos.
// - A deformação some com suavidade até a borda da área (sem quina) e é lida espelhada nas bordas do quadro.
// - O escorrido é um ruído de gradiente suave em colunas; os trancos vêm em rajadas (acaso por janela de tempo),
//   com as linhas pulando de lado a 15 quadros por segundo.
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 p = (uv - centro) * vec2(ratio, 1.0);
  float r = length(p) / raio;
  float w = (1.0 - smoothstep(0.45, 1.0, r)) * forca;
  if (w <= 0.0) return vec4(getColor(uv).rgb, 1.0);

  vec2 q = p;
  // Mais comprido: cada ponto busca a imagem mais perto do centro na vertical.
  q.y /= 1.0 + esticar * 0.9 * w;
  // Testa estreita e boca larga demais (a metade de baixo abre para os lados).
  float lower = smoothstep(0.1, -0.4, p.y / raio);
  q.x /= 1.0 + (sorriso * 0.9 * lower - esticar * 0.2) * w;
  // Os traços escorrem para baixo em colunas irregulares.
  float melt = lmNoise(vec2(p.x * 14.0 / raio, time * 0.5)) * 0.5 + 0.5;
  q.y += derreter * 0.12 * raio * w * melt;
  // Trancos: as linhas pulam de lado em rajadas curtas.
  float burst = step(0.55, lmHash(vec2(floor(time * 5.0), 2.0)));
  float frame = floor(time * 15.0);
  q.x += (lmHash(vec2(floor(uv.y * 90.0), frame)) - 0.5) * 0.08 * raio * tremor * w * (0.25 + 0.75 * burst);

  vec3 col = getColor(mirrorUv(q / vec2(ratio, 1.0) + centro)).rgb;
  // Um pouco mais duro e sem cor, como quem não está bem.
  float l = lmLuma(col);
  col = mix(col, vec3(smoothstep(0.05, 0.95, l)), 0.3 * w);
  return vec4(col, 1.0);
}
