// Nuvem: uma massa de nuvem (ruído fbm em 3D que se revolve enquanto anda) atravessa a tela da esquerda para a
// direita com aceleração suave, cobre a troca no seu miolo denso e deixa o próximo clipe atrás de si. A nuvem tem
// volume: lado iluminado de cima quase branco, sombra azulada embaixo e nas partes densas, borda fina translúcida
// com contorno prateado. Tudo com a proporção certa e misturado em luz linear.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float e = lmEaseInOutSine(progress);
  float c = mix(-ratio * 0.5 - 1.3, ratio * 0.5 + 1.3, e);
  float t = progress * 1.5;
  vec2 q = p * 2.2 + vec2(-t * 0.8, 0.0);
  float n = lmFbm(vec3(q, t * 0.6), 4);
  // Densidade: uma faixa larga em volta de c, recortada pelo ruído (mais fina em cima e embaixo).
  float base = 1.0 - abs(p.x - c) / 0.75 - 0.2 * abs(p.y);
  float density = smoothstep(0.0, 0.35, base + n * 0.45 - 0.15);
  // Volume (luz de cima à esquerda): quanto mais nuvem há entre o ponto e a luz, mais sombra (Beer); usa só as
  // oitavas grossas, para a sombra ter forma de nuvem e não de manchas.
  float coarse = base + lmFbm(q + vec2(0.0, t * 0.3), 3) * 0.45;
  float toward = base + lmFbm(q + vec2(-0.25, 0.35 + t * 0.3), 3) * 0.45;
  float shade = exp(-max(toward - coarse + 0.08, 0.0) * 2.2) * (0.86 + 0.14 * clamp(p.y + 0.5, 0.0, 1.0));
  float thick = smoothstep(0.3, 1.3, coarse);
  shade *= 1.0 - 0.25 * thick;
  vec3 cloud = mix(vec3(0.50, 0.54, 0.62), vec3(1.0, 0.99, 0.97), clamp(shade, 0.0, 1.0));
  // Contorno prateado onde a nuvem é fina.
  float rim = smoothstep(0.05, 0.3, density) * (1.0 - smoothstep(0.3, 0.75, density));
  cloud += vec3(0.2) * rim;

  // Atrás do miolo já está o próximo clipe.
  float m = 1.0 - smoothstep(-0.06, 0.06, p.x + n * 0.35 - c);
  vec3 img = mix(lmToLinear(getFromColor(uv).rgb), lmToLinear(getToColor(uv).rgb), m);
  vec3 lin = mix(img, cloud, density * 0.98);
  return vec4(lmToSrgb(lin), 1.0);
}
