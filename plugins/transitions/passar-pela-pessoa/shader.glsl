/** O recorte da pessoa (ou, sem pessoa no clipe, uma forma oval no meio da tela). */
float body(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  if (uHasPerson.x > 0.5) return getFromPerson(p);
  return 1.0 - smoothstep(0.9, 1.0, length((p - vec2(0.5, 0.45)) * vec2(ratio, 1.0) / vec2(0.22, 0.38)));
}

/**
 * Quanto do próximo clipe aparece aqui: a silhueta arrastada pela tela (o rastro dela) e, quanto mais
 * longe do corpo, mais o rastro se abre para cima e para baixo, até cobrir tudo.
 */
float swept(vec2 uv, float e) {
  vec2 dir = direcao < 0.5 ? vec2(1.0, 0.0) : vec2(-1.0, 0.0);
  float reach = pow(e, 1.5) * 1.3;
  float spread = e * e * mix(0.3, 1.4, abrir);
  float r = 0.0;
  for (int i = 0; i < 24; i++) {
    float k = float(i) / 23.0;
    vec2 p = uv - dir * reach * k;
    float s = spread * k;
    r = max(r, body(p));
    r = max(r, body(p + vec2(0.0, s * 0.5)));
    r = max(r, body(p - vec2(0.0, s * 0.5)));
    r = max(r, body(p + vec2(0.0, s)));
    r = max(r, body(p - vec2(0.0, s)));
  }
  return r;
}

vec4 transition(vec2 uv) {
  float e = smoothstep(0.0, 1.0, progress);
  float reveal = swept(uv, e);
  // Borda: onde o rastro está chegando (comparado com um instante antes).
  float edge = clamp(reveal - swept(uv, max(0.0, e - 0.04)), 0.0, 1.0);
  reveal = clamp(reveal + smoothstep(0.82, 1.0, progress), 0.0, 1.0);
  vec4 col = mix(getFromColor(uv), getToColor(uv), reveal);
  col.rgb += borda * edge * brilho * (1.0 - smoothstep(0.75, 1.0, progress));
  return col;
}
