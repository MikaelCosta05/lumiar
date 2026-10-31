// Por profundidade: um plano de névoa anda do fundo para a frente (ou ao contrário) e o que fica atrás dele já é
// o próximo clipe. A frente é irregular (fbm), como neblina de verdade, anda com aceleração, e tem uma faixa
// de luz na cor escolhida mais uma névoa larga e fraca, somadas como luz e sem estourar.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float d = getFromDepth(uv);
  if (sentido > 0.5) d = 1.0 - d;
  // Neblina irregular que se mexe devagar.
  vec2 p = lmCentered(uv) * 3.0;
  d += 0.07 * lmFbm(vec3(p, progress * 1.2), 4);
  float w = suavidade;
  float front = mix(-w - 0.1, 1.0 + w + 0.1, lmEaseInOutSine(progress));
  float reveal = 1.0 - smoothstep(front - w, front + w, d);
  float x = d - front;
  float band = exp(-x * x / (2.0 * pow(w * 0.6, 2.0)));
  float mist = exp(-x * x / (2.0 * pow(w * 2.5, 2.0)));
  vec4 col = mix(getFromColor(uv), getToColor(uv), reveal);
  float env = smoothstep(0.0, 0.12, progress) * (1.0 - smoothstep(0.85, 1.0, progress));
  vec3 light = lmToLinear(cor) * (band * 0.55 + mist * 0.12) * brilho * env;
  return vec4(addGlow(col.rgb, light), col.a);
}
