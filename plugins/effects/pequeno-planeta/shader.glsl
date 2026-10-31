// Pequeno planeta: a imagem enrolada em volta do centro (o chão no meio, o céu para fora).
// - Raio com projeção do tipo estereográfica: o horizonte fica no mesmo lugar de antes, mas os cantos chegam
//   perto do topo da imagem sem nunca passar dele (antes o topo era esticado nos cantos).
// - Emenda: as bordas esquerda e direita da imagem se encontram num ângulo; ali uma faixa estreita faz a passagem
//   suave entre elas, sem a linha de corte.
// - Perto do centro, onde a imagem inteira se comprime num ponto, a leitura usa o nível de detalhe certo (sem o
//   chuvisco de moiré).
vec4 effect(vec2 uv) {
  vec2 p = lmCentered(uv) / zoom;
  float r = max(length(p), 1e-5);
  float a = atan(p.x, -p.y);
  float s = fract(a / (2.0 * PI) + 0.5 + time * spin);
  float y = atan(r * 4.0) * (2.0 / PI);

  const float SEAM = 0.08;
  float u = SEAM + s * (1.0 - SEAM);
  float blend = smoothstep(1.0 - SEAM, 1.0, u);

  // Tamanho de um pixel na imagem: na volta (cresce perto do centro) e no raio.
  float px = 1.0 / (resolution.y * zoom);
  float around = px / (2.0 * PI * r) * (1.0 - SEAM) * resolution.x;
  float radial = px * (8.0 / PI) / (1.0 + 16.0 * r * r) * resolution.y;
  float lod = max(log2(max(around, radial)), 0.0);

  vec4 c = getColorLod(vec2(u, y), lod);
  if (blend > 0.0) c = mix(c, getColorLod(vec2(u - 1.0 + SEAM, y), lod), blend);
  return c;
}
