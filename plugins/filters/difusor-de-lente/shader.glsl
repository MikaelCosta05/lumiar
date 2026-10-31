// Difusor de lente (tipo Pro-Mist branco): o vidro espalha parte da luz pela imagem toda (os pretos ficam leves e o
// contraste cai) e as luzes ganham um halo macio. Tudo em luz linear, com o espalhamento lido do mapa de níveis
// (largo, liso, sem cópias); "Tamanho do halo" abre o raio. As altas luzes são comprimidas, sem estourar.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lin = lmToLinear(c.rgb);
  // Véu: a imagem toda, borrada, um pouco por cima.
  vec3 veil = lmBloom(uv, 0.0, mix(0.35, 0.75, size));
  // Halo: só o que é claro, mais largo.
  vec3 glow = lmBloom(uv, 0.32, mix(0.3, 1.0, size));
  lin = mix(lin, veil, 0.2 * halo);
  lin += glow * vec3(1.03, 1.0, 0.96) * 2.6 * halo;
  return vec4(lmSoftClip(lmToSrgb(lin), 0.85), c.a);
}
