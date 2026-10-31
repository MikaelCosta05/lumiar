// Flash de cor. As partes claras chegam na cor antes das escuras (curva por pixel, não uma tinta por cima); com cor
// clara e "Estourar luzes", a imagem também ganha exposição (somada em luz linear, com ombro suave nas altas luzes)
// e as luzes vazam um brilho largo em volta no meio do flash (halation), que some quando a cor cobre tudo.
// Quantidade 1 = só a cor.

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float a = clamp(amount, 0.0, 1.0);
  vec3 tintLin = lmToLinear(tint);
  float lightTint = smoothstep(0.15, 0.6, lmLuma(tint));
  vec3 col = c.rgb;
  if (glow > 0.0 && a > 0.0 && a < 1.0) {
    // Exposição: cada pixel recebe luz proporcional à que já tem (as luzes estouram antes das sombras).
    vec3 lin = lmToLinear(col);
    vec3 push = lin * glow * a * 2.2 * mix(vec3(1.0), tintLin, 0.5) * lightTint;
    // Halation: as altas luzes espalham um halo largo, mais forte no meio do flash.
    push += lmBloom(uv, 0.35, 0.7) * glow * lmBell(a) * 1.2 * mix(vec3(1.0), tintLin, 0.6);
    col = lmToSrgb(addLightSoft(lin, push));
  }
  // Expoente maior nas luzes: elas chegam na cor primeiro. Sem "estourar", vale a quantidade igual para todos.
  float l = lmLuma(c.rgb);
  float k = 1.0 - pow(1.0 - a, 1.0 + glow * 2.4 * l * l);
  return vec4(mix(col, tint, k), c.a);
}
