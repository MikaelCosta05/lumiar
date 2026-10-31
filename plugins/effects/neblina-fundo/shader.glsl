// Neblina e luz só no fundo. A névoa segue a lei da atmosfera (quanto mais longe, mais luz trocada pela cor do ar,
// em luz linear), com nuvens de névoa de ruído fbm que andam devagar; o que está perto continua nítido. Os raios
// atravessam o que está longe e são bloqueados pelo que está perto (a pessoa faz sombra no feixe), com as amostras
// espalhadas por pixel para não deixar degraus, e somam como luz, sem estourar.

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 lin = lmToLinear(base.rgb);
  float far = 1.0 - getDepth(uv);
  float reach = mix(0.25, 0.95, alcance);

  // Névoa: densidade pela distância, com nuvens de névoa passando devagar.
  vec2 s = lmCentered(uv);
  float drift = time * movimento * 0.05;
  float puffs = 1.0 + 0.5 * lmFbm(vec3(s * 2.6 + vec2(drift, drift * 0.3), time * movimento * 0.04), 3);
  float texture_ = mix(1.0, puffs, movimento);
  float dist = smoothstep(1.0 - reach, 1.0, far);
  float fog = 1.0 - exp(-1.4 * neblina * dist * texture_);
  lin = mix(lin, lmToLinear(cor), clamp(fog, 0.0, 0.94));

  // Raios: a luz atravessa o que está longe e é bloqueada pelo que está perto.
  if (raios > 0.0) {
    vec2 light = vec2(origem.x, 1.0 - origem.y);
    float jitter = lmIGN(gl_FragCoord.xy);
    float sum = 0.0;
    float wsum = 0.0;
    for (int i = 0; i < 32; i++) {
      float k = (float(i) + jitter) / 32.0;
      vec2 p = mix(uv, light, k * 0.92);
      float open = smoothstep(0.35, 0.75, 1.0 - getDepth(p));
      float w = exp(-1.3 * k);
      sum += open * w;
      wsum += w;
    }
    float rays = sum / wsum * exp(-length((uv - light) * vec2(ratio, 1.0)) * 1.1);
    // Feixe com textura: o ar não é uniforme (raios mais fortes e mais fracos em volta da origem).
    vec2 v = (uv - light) * vec2(ratio, 1.0);
    float ang = atan(v.y, v.x);
    float streaks = 0.8 + 0.2 * lmNoise(vec2(cos(ang), sin(ang)) * 4.0 + vec2(time * 0.05, 0.0));
    lin = addLightSoft(lin, lmToLinear(corLuz) * rays * streaks * raios * smoothstep(0.2, 0.6, far) * 1.1);
  }
  return vec4(lmToSrgb(lin), base.a);
}
