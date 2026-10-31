// Reflexo de lente como o de uma objetiva de verdade: núcleo e halo da fonte, estrela de difração suave com estrias,
// risco anamórfico, anel de arco-íris e fantasmas (reflexos internos) no formato do diafragma, alinhados no eixo
// que passa pela fonte e pelo centro do quadro, cada um com a franja de cor da aberração. Tudo somado como luz.

/** Distância a um hexágono (o diafragma de 6 lâminas), raio interno "r". */
float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

/** Um fantasma: polígono de bordas arredondadas, mais claro na borda (como nas lentes reais), borda macia. */
float ghost(vec2 p, float r) {
  float d = mix(length(p) - r, sdHex(p, r * 0.93), 0.65);
  float soft = r * 0.10 + lmPx(1.5);
  float fill = 1.0 - smoothstep(-soft, soft, d);
  float body = 0.45 + 0.55 * pow(clamp(length(p) / r, 0.0, 1.0), 3.0);
  float rim = exp(-pow(d / (r * 0.07 + lmPx(1.5)), 2.0));
  return fill * body + rim * 0.35;
}

/** Fantasma com aberração: cada cor fica num ponto um pouco diferente do eixo e com tamanho um pouco diferente. */
vec3 ghostRgb(vec2 p, vec2 axis, float f, float r) {
  vec3 g;
  g.r = ghost(p - axis * f * 1.025, r * 1.035);
  g.g = ghost(p - axis * f, r);
  g.b = ghost(p - axis * f * 0.975, r * 0.965);
  return g;
}

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  vec2 p = lmCentered(uv);
  vec2 L = lmCentered(source);
  vec2 v = p - L;
  float d = length(v);
  // Quanto mais longe do centro, mais fortes os fantasmas (a luz entra mais inclinada na lente).
  float offAxis = smoothstep(0.02, 0.6, length(L));

  vec3 flare = vec3(0.0);
  // Núcleo, brilho em volta e véu largo (cor de sol, mais quente para fora).
  flare += vec3(1.0, 0.95, 0.88) * exp(-d / 0.010) * 1.6;
  flare += vec3(1.0, 0.82, 0.60) * exp(-d / 0.055) * 0.65;
  flare += vec3(1.0, 0.76, 0.52) * exp(-d / 0.11) * 0.22;
  flare += vec3(1.0, 0.70, 0.45) * exp(-d / 0.22) * 0.16;

  // Estrela de difração: 6 raios suaves mais estrias finas que tremulam devagar.
  float a = atan(v.y, v.x);
  float spikes = pow(abs(cos(a * 3.0 + 0.35)), 70.0);
  vec2 ring = vec2(cos(a), sin(a));
  float streaks = pow(0.5 + 0.5 * lmNoise(ring * 9.0 + vec2(time * 0.15, 3.7)), 5.0);
  streaks += 0.5 * pow(0.5 + 0.5 * lmNoise(ring * 23.0 + vec2(-time * 0.1, 9.1)), 8.0);
  flare += vec3(1.0, 0.9, 0.78) * (spikes * 0.32 * exp(-d / 0.11) + streaks * 0.22 * exp(-d / 0.10)) * smoothstep(0.0, 0.012, d);

  // Risco anamórfico horizontal (azulado), fino e longo.
  float dy = abs(v.y);
  flare += vec3(0.55, 0.72, 1.0) * exp(-dy / lmPx(2.5)) * exp(-abs(v.x) / 0.55) * 0.30;
  flare += vec3(0.45, 0.62, 1.0) * exp(-dy / lmPx(14.0)) * exp(-abs(v.x) / 0.30) * 0.07;

  // Anel de arco-íris em volta da fonte (dispersão: cada cor num raio).
  float R = 0.30;
  vec3 rr = vec3(R * 1.03, R, R * 0.97);
  vec3 halo = exp(-pow((vec3(d) - rr) / 0.018, vec3(2.0)));
  flare += halo * vec3(1.0, 0.85, 1.0) * 0.07 * (0.6 + 0.4 * offAxis);

  // Fantasmas no eixo fonte → centro → lado oposto (f = posição ao longo do eixo; 1 = na fonte, negativo = depois do centro).
  vec3 gh = vec3(0.0);
  gh += ghostRgb(p, L, 0.62, 0.022) * vec3(1.0, 0.75, 0.35) * 0.30;
  gh += ghostRgb(p, L, 0.30, 0.050) * vec3(0.45, 1.0, 0.55) * 0.14;
  gh += ghostRgb(p, L, -0.22, 0.032) * vec3(0.40, 0.70, 1.0) * 0.20;
  gh += ghostRgb(p, L, -0.48, 0.085) * vec3(0.80, 0.72, 1.0) * 0.055;
  gh += ghostRgb(p, L, -0.78, 0.040) * vec3(1.0, 0.45, 0.70) * 0.20;
  gh += ghostRgb(p, L, -1.10, 0.140) * vec3(0.35, 0.85, 0.70) * 0.06;
  gh += ghostRgb(p, L, -1.45, 0.060) * vec3(1.0, 0.65, 0.30) * 0.13;
  flare += gh * (0.35 + 0.65 * offAxis);

  // Véu: a luz espalhada dentro da lente levanta um pouco os pretos da imagem toda.
  flare += vec3(1.0, 0.9, 0.78) * 0.012;

  vec3 col = addLightSoft(lmToLinear(c), flare * amount);
  return vec4(lmToSrgb(col), 1.0);
}
