// 3D anaglifo (vermelho e ciano): cada olho vê a imagem de um ponto um pouco diferente, com o deslocamento
// dependendo da profundidade (o que está perto sai da tela, o fundo fica atrás). Anaglifo de cor em luz linear: o
// vermelho vem da vista do olho esquerdo e o verde e o azul da do direito, então onde as vistas coincidem (o fundo) a
// cor fica igual à original e só os contornos ganham as franjas vermelha e ciano. O vermelho é um pouco dessaturado
// (menos brilho trocado entre os olhos com o óculos), sem as matrizes de Dubois, que deixam a imagem toda verde-oliva
// e escura para quem vê sem o óculos. Nas bordas a imagem é espelhada, não esticada.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // Paralaxe: o fundo quase parado, o que está perto bem separado.
  float depth = clamp(getDepth(uv), 0.0, 1.0);
  float shift = amount * (depth * 1.5 - 0.25);
  vec3 L = lmToLinear(getColor(mirrorUv(uv + vec2(shift, 0.0))).rgb);
  vec3 R = lmToLinear(getColor(mirrorUv(uv - vec2(shift, 0.0))).rgb);
  vec3 col = vec3(mix(L.r, lmLuma(L), 0.25), R.g, R.b);
  return vec4(lmToSrgb(clamp(col, 0.0, 1.0)), 1.0);
}
