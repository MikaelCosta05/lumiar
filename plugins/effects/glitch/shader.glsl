// Glitch: faixas deslocadas, canais separados e blocos invertidos, como um sinal digital corrompido.
// - Acaso da biblioteca (sem os padrões do seno); as falhas vêm em rajadas (um envelope de ruído suave no tempo
//   decide quando o sinal "engasga"), não com a mesma frequência o tempo todo.
// - Faixas de alturas variadas: cada faixa pode se partir em 1 a 4 fatias finas.
// - O deslocamento dá a volta na largura (como uma linha de vídeo fora de sincronia), sem esticar a borda.
// - Blocos invertidos só num trecho da faixa.
vec4 effect(vec2 uv) {
  float t = floor(time * speed * 4.0);
  float burst = smoothstep(0.25, 0.75, lmNoise(vec2(time * speed * 0.6, 3.1)) * 0.5 + 0.5);
  float yb = uv.y * bands;
  float row = floor(yb);
  float slices = 1.0 + floor(lmHash(vec2(row, t + 0.5)) * 4.0);
  float id = row * 4.0 + floor(fract(yb) * slices);

  float chance = intensity * 0.6 * (0.35 + 0.65 * burst);
  float glitched = step(1.0 - chance, lmHash(vec2(id, t)));
  float shift = (lmHash(vec2(t, id + 7.0)) - 0.5) * 0.2 * intensity * glitched;
  float x = fract(uv.x + shift);

  float split = (0.02 * glitched + 0.003) * intensity;
  vec4 c = getColor(vec2(x, uv.y));
  c.r = getColor(vec2(fract(x + split), uv.y)).r;
  c.b = getColor(vec2(fract(x - split), uv.y)).b;

  // Bloco invertido: um trecho horizontal de uma fatia.
  float x0 = lmHash(vec2(id * 3.1, t + 1.3));
  float x1 = x0 + 0.1 + 0.35 * lmHash(vec2(id, t + 2.7));
  float inBlock = step(x0, uv.x) * step(uv.x, x1);
  float invert = step(0.97 - 0.03 * burst, lmHash(vec2(id * 1.7, t + 4.1))) * step(0.5, intensity) * inBlock;
  c.rgb = mix(c.rgb, 1.0 - c.rgb, invert);
  return c;
}
