// Passar pela pessoa: a pessoa do clipe atual vira uma janela para o próximo. A silhueta é arrastada pela tela
// com aceleração e, quanto mais longe do corpo, mais o rastro se estica para cima e para baixo, até cobrir
// tudo. O rastro é a união contínua da silhueta ao longo do caminho (96 passos com o corpo esticado aos poucos,
// começando num ponto diferente por pixel, então sem cópias recortadas nem borda em serra) e a frente do rastro
// tem uma borda de luz na cor escolhida, somada como luz. Sem pessoa no clipe, uma forma oval no meio da tela
// faz o papel do corpo.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

/** O recorte da pessoa (ou, sem pessoa no clipe, uma forma oval no meio da tela). */
float body(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  if (uHasPerson.x > 0.5) return getFromPerson(p);
  return 1.0 - smoothstep(0.9, 1.0, length((p - vec2(0.5, 0.45)) * vec2(ratio, 1.0) / vec2(0.22, 0.38)));
}

/** Quanto do próximo clipe aparece aqui: a silhueta arrastada (e esticada na vertical) ao longo do caminho. */
float swept(vec2 uv, float e, int steps) {
  vec2 dir = direcao < 0.5 ? vec2(1.0, 0.0) : vec2(-1.0, 0.0);
  float reach = pow(e, 1.5) * 1.3;
  float spread = e * e * mix(0.6, 2.8, abrir);
  float r = 0.0;
  // Os passos começam num ponto diferente em cada pixel (ruído intercalado): sem isso, onde o corpo é
  // esticado a borda do rastro vira uma serra com um dente por passo.
  float jitter = lmIGN(gl_FragCoord.xy);
  float last = float(steps - 2);
  for (int i = 0; i < 96; i++) {
    if (i >= steps) break;
    float k = min(max(float(i) - 1.0 + jitter, 0.0) / last, 1.0);
    vec2 p = uv - dir * reach * k;
    // Esticar em volta do meio da altura: o rastro se abre para cima e para baixo sem cópias soltas.
    p.y = 0.5 + (p.y - 0.5) / (1.0 + spread * k);
    r = max(r, body(p));
    if (r >= 1.0) break;
  }
  return r;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float e = lmEaseInOutSine(progress);
  float reveal = swept(uv, e, 96);
  // Borda: onde o rastro está chegando (comparado com um instante antes).
  float edge = clamp(reveal - swept(uv, max(0.0, e - 0.035), 40), 0.0, 1.0);
  // A janela aparece suave no começo e o resto da tela se completa no fim.
  reveal *= lmEaseOutCubic(clamp(progress / 0.08, 0.0, 1.0));
  reveal = clamp(reveal + lmEaseInOutSine(clamp((progress - 0.8) / 0.2, 0.0, 1.0)), 0.0, 1.0);
  vec4 col = mix(getFromColor(uv), getToColor(uv), reveal);
  float env = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.75, 1.0, progress));
  return vec4(addGlow(col.rgb, lmToLinear(borda) * edge * brilho * 1.4 * env), col.a);
}
