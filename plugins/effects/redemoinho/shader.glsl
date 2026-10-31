// Redemoinho: torce a imagem em espiral em volta de um ponto.
// - O giro cai suavemente até zero no raio (sem quina na borda do redemoinho).
// - Onde a torção é forte a imagem se comprime em espiras finas: a leitura usa o nível de detalhe proporcional a
//   essa compressão (sem moiré nem chuvisco perto do centro).
// - O que gira para fora do quadro é lido espelhado (nada de faixa esticada nos cantos).
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - center) * aspect;
  float r = length(p);
  float k = clamp(1.0 - r / radius, 0.0, 1.0);
  float turn = strength + time * speed;
  p = lmRotate(p, -k * k * turn);
  // Compressão local: deslocamento tangencial por unidade de raio.
  float shear = r * 2.0 * k * abs(turn) / radius;
  float lod = max(log2(sqrt(1.0 + shear * shear)), 0.0);
  return getColorLod(mirrorUv(p / aspect + center), lod);
}
