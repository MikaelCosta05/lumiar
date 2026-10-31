// Glitch digital: falha de compressão de vídeo.
// - Macroblocos quadrados: um bloco atingido mostra o conteúdo de outro bloco (deslocado em múltiplos do tamanho
//   do bloco, dando a volta no quadro, como um vetor de movimento errado), com as cores achatadas em poucos níveis.
// - Alguns blocos "congelam" repetindo a primeira linha (o borrão vertical do datamosh).
// - Canais trocados nos blocos mais fortes e linhas finas invertidas; tudo vem em rajadas.
vec4 effect(vec2 uv) {
  float t = floor(time * rate);
  float burst = smoothstep(0.2, 0.7, lmNoise(vec2(time * rate * 0.08, 7.3)) * 0.5 + 0.5);
  float a = amount * (0.35 + 0.65 * burst);
  vec2 grid = vec2(ratio, 1.0) * blocks;
  vec2 block = floor(uv * grid);
  float h = lmHash(vec3(block, t));
  float hit = step(1.0 - a * 0.5, h);

  vec2 jump = floor((lmHash2(block * 1.3 + t) - 0.5) * 6.0) / grid;
  vec2 src = fract(uv + jump * hit);
  // Borrão: o bloco repete a linha de cima.
  float smear = hit * step(0.6, lmHash(vec3(block, t + 3.0)));
  vec2 top = (floor(src * grid) + vec2(fract(src.x * grid.x), 0.98)) / grid;
  src = mix(src, top, smear);
  vec4 c = getColor(src);

  // Cores achatadas no bloco corrompido.
  float levels = 6.0;
  c.rgb = mix(c.rgb, floor(c.rgb * levels + 0.5) / levels, hit * 0.8);
  if (h > 1.0 - a * 0.12) c.rgb = c.gbr;
  float line = step(0.985, lmHash(vec2(floor(uv.y * 200.0), t)));
  c.rgb = mix(c.rgb, vec3(1.0) - c.rgb, line * amount * (0.4 + 0.6 * burst));
  return c;
}
