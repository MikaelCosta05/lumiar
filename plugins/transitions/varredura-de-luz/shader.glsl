// Varredura de luz: um feixe atravessa a tela na diagonal com aceleração, com miolo fino e brilho largo
// (perfis gaussianos) somados como luz e as altas luzes comprimidas; a imagem também se acende perto do feixe.
// A troca de clipe acontece embaixo do miolo, onde a luz esconde o corte.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  vec2 dir = normalize(vec2(1.0, 0.5));
  float c = dot(p, dir);
  float ext = dir.x * ratio * 0.5 + dir.y * 0.5;
  const float wide = 0.35;
  float pos = mix(-ext - wide, ext + wide, lmEaseInOutCubic(progress));
  float x = c - pos;
  float m = 1.0 - smoothstep(-0.03, 0.03, x);
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  float env = lmBell(progress);
  float core = exp(-x * x / (2.0 * 0.012 * 0.012));
  float glow = exp(-x * x / (2.0 * 0.07 * 0.07));
  float haze = exp(-x * x / (2.0 * 0.2 * 0.2));
  vec3 tintLin = lmToLinear(tint);
  // A imagem embaixo do feixe acende (como luz batendo nela) e o feixe soma por cima.
  vec3 lin = lmToLinear(col.rgb);
  vec3 light = lin * (glow * 1.2 + haze * 0.3) * tintLin + tintLin * (core * 1.4 + glow * 0.35 + haze * 0.08);
  return vec4(addGlow(col.rgb, light * intensity * env), col.a);
}
