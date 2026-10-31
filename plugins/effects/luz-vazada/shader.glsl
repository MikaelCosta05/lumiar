// Luz vazada (light leak) de película: manchas grandes de luz quente que entram pelas bordas do quadro, com contorno
// orgânico (ruído fbm deformando o espaço), estrias suaves no sentido da película e a cor de queimado de filme
// (vermelho fundo → laranja → amarelo → quase branco no miolo). Os caminhos das manchas vêm de ruído suave: andam sem
// repetir e sem trancos. Somada como luz, em luz linear, comprimindo só o que passaria do branco.

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

/** Cor da luz pela energia: as bordas fracas são vermelhas, o miolo forte fica amarelo-claro. */
vec3 leakColor(float e) {
  vec3 c = vec3(0.95, 0.12, 0.02);
  c = mix(c, vec3(1.0, 0.38, 0.06), smoothstep(0.15, 0.6, e));
  c = mix(c, vec3(1.0, 0.70, 0.30), smoothstep(0.5, 1.0, e));
  c = mix(c, vec3(1.0, 0.92, 0.78), smoothstep(0.95, 1.6, e));
  return c * e;
}

/** Mancha alongada e macia (gaussiana) em volta de "c". */
float blob(vec2 q, vec2 c, vec2 scale, float size) {
  vec2 d = (q - c) * scale;
  return exp(-dot(d, d) / (size * size));
}

vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  vec2 p = lmCentered(uv);
  float hw = 0.5 * ratio;
  float t = time * speed * 0.22;

  // Espaço deformado pelo ruído: as manchas ganham contorno de fumaça, não de círculo.
  vec2 warp = vec2(lmFbm(vec3(p * 1.4, t * 0.6), 3), lmFbm(vec3(p * 1.4 + 7.3, t * 0.6 + 3.1), 3));
  vec2 q = p + warp * 0.32;

  // Caminhos das manchas (ruído suave no tempo), presas às bordas: esquerda, direita e o canto de cima.
  vec2 c1 = vec2(-hw - 0.05 + 0.22 * lmNoise(vec2(t * 0.9, 1.3)), 0.15 + 0.35 * lmNoise(vec2(t * 0.7, 5.1)));
  vec2 c2 = vec2(hw + 0.08 + 0.20 * lmNoise(vec2(t * 0.8, 9.7)), -0.15 + 0.35 * lmNoise(vec2(t * 0.6, 2.9)));
  vec2 c3 = vec2(0.45 * hw * lmNoise(vec2(t * 0.5, 13.1)) + 0.25 * hw, 0.62 + 0.10 * lmNoise(vec2(t * 0.9, 4.4)));

  // Respiração de cada mancha: crescem e somem devagar, uma de cada vez.
  float b1 = smoothstep(-0.35, 0.45, lmNoise(vec2(t * 0.45, 21.0)));
  float b2 = smoothstep(-0.35, 0.45, lmNoise(vec2(t * 0.45, 33.0)));
  float b3 = smoothstep(-0.20, 0.55, lmNoise(vec2(t * 0.45, 47.0)));

  float e = 0.0;
  e += 1.35 * b1 * blob(q, c1, vec2(1.0, 0.65), 0.42);
  e += 1.10 * b2 * blob(q, c2, vec2(1.0, 0.70), 0.36);
  e += 0.80 * b3 * blob(q, c3, vec2(0.55, 1.0), 0.30);

  // Estrias finas no sentido da película e manchas internas (luz que passa por camadas do filme).
  float streak = 0.72 + 0.28 * lmFbm(vec2(q.x * 2.2 + t * 0.3, q.y * 9.0), 3);
  float mottle = 0.80 + 0.20 * lmFbm(q * 3.5 + vec2(t * 0.8, -t * 0.5), 3);
  e *= streak * mottle;

  vec3 leak = leakColor(e);
  // A película inteira fica um pouco mais quente onde a luz está forte (o vazamento também véu).
  leak += vec3(1.0, 0.45, 0.15) * 0.04 * smoothstep(0.0, 1.0, b1 + b2 + b3);
  vec3 col = addLightSoft(lmToLinear(c), leak * amount * 1.25);
  return vec4(lmToSrgb(col), 1.0);
}
