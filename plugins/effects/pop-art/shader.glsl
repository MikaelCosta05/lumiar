// Pop art à moda das serigrafias de Warhol: quatro cópias, cada uma com três cores chapadas e a tela preta da
// serigrafia impressa por cima, um pouco fora de registro.
// - Tom lido numa versão levemente borrada (as áreas ficam limpas, sem chuvisco na pele e no cabelo) e
//   separado em três cores com a borda antisserrilhada pela derivada do pixel.
// - Nos meios-tons, pontos Ben-Day redondos a 45° (antisserrilhados, tamanho fixo de 1080p).
// - Tela preta: as sombras fundas em preto de tinta, deslocadas alguns px como na impressão à mão.

float soft(float edge, float x) {
  float w = max(fwidth(x), 1e-4) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}

vec4 effect(vec2 uv) {
  vec2 g = floor(uv * 2.0);
  vec2 local = fract(uv * 2.0);
  int panel = int(g.x + g.y * 2.0);
  float lod = max(log2(3.0 * resolution.y / 1080.0), 0.0);
  float l = lmLuma(getColorLod(local, lod).rgb);

  vec3 A[4] = vec3[4](vec3(0.1, 0.05, 0.35), vec3(0.8, 0.0, 0.3), vec3(0.0, 0.25, 0.5), vec3(0.35, 0.0, 0.0));
  vec3 B[4] = vec3[4](vec3(1.0, 0.2, 0.6), vec3(0.0, 0.7, 0.9), vec3(1.0, 0.8, 0.0), vec3(0.1, 0.85, 0.4));
  vec3 C[4] = vec3[4](vec3(1.0, 0.95, 0.2), vec3(1.0, 0.95, 0.85), vec3(1.0, 0.4, 0.7), vec3(1.0, 0.9, 0.7));
  float toB = soft(0.33, l);
  float toC = soft(0.62, l);
  vec3 col = mix(mix(A[panel], B[panel], toB), C[panel], toC);

  // Pontos Ben-Day nos meios-tons: um pouco mais escuros que a cor de baixo.
  vec2 p = lmCentered(uv) * 1080.0;
  vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.70710678 / 9.0;
  float d = length(fract(q) - 0.5) * 9.0;
  float mid = toB * (1.0 - toC);
  float r = 2.6 * mid * (0.6 + 0.4 * smoothstep(0.62, 0.33, l));
  float aa = max(fwidth(d), 0.3);
  float dotInk = 1.0 - smoothstep(r - aa, r + aa, d);
  col = mix(col, col * vec3(0.72, 0.68, 0.75), dotInk * step(0.05, r));

  // Tela preta da serigrafia, fora de registro (cada quadro desloca de um jeito).
  vec2 shift = (vec2(lmHash(float(panel) + 0.5), lmHash(float(panel) + 7.5)) - 0.5) * lmPxUv(14.0) * 2.0;
  float ls = lmLuma(getColorLod(1.0 - abs(1.0 - mod(local + shift * 2.0, 2.0)), lod).rgb);
  float black = 1.0 - soft(0.16, ls);
  col = mix(col, vec3(0.05, 0.04, 0.06), black * 0.92);
  return vec4(col, 1.0);
}
