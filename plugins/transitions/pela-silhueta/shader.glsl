// Pela silhueta: o próximo clipe aparece dentro do corpo da pessoa e a silhueta cresce com aceleração até tomar
// a tela. A borda brilhante vem da inclinação da máscara (um contorno contínuo, sem os degraus de 8 amostras),
// com um halo mais largo, tudo somado como luz na cor escolhida; dentro da silhueta o próximo clipe chega com
// um leve zoom que assenta. Sem pessoa no clipe, uma forma oval no centro faz o papel do corpo.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

/** A silhueta (ou, sem pessoa no clipe, uma forma oval no centro). */
float silhouette(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  if (uHasPerson.x > 0.5) return getFromPerson(p);
  vec2 c = vec2(centro.x, 1.0 - centro.y);
  return 1.0 - smoothstep(0.9, 1.0, length((p - c) * vec2(ratio, 1.0) / vec2(0.22, 0.35)));
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 c = vec2(centro.x, 1.0 - centro.y);
  bool first = dentroPrimeiro > 0.5;
  float show = first ? lmEaseInOutSine(clamp(progress / 0.3, 0.0, 1.0)) : 1.0;
  float grow = first ? lmEaseInOutCubic(clamp((progress - 0.3) / 0.7, 0.0, 1.0)) : lmEaseInOutCubic(progress);
  float scale = 1.0 + grow * grow * 14.0;
  // Ponto da silhueta original que, depois de crescer, cobre este pixel.
  vec2 p = c + (uv - c) / scale;
  float inside = silhouette(p);
  // Contorno: inclinação da máscara a 2 px e um halo a 9 px (em pixels de 1080p, na tela).
  vec2 px = vec2(1.0 / ratio, 1.0) / (scale * 1080.0);  // 1 px de 1080p na tela, em uv da silhueta original
  vec2 d1 = px * 2.0, d2 = px * 9.0;
  float gx = silhouette(p + vec2(d1.x, 0.0)) - silhouette(p - vec2(d1.x, 0.0));
  float gy = silhouette(p + vec2(0.0, d1.y)) - silhouette(p - vec2(0.0, d1.y));
  float hx = silhouette(p + vec2(d2.x, 0.0)) - silhouette(p - vec2(d2.x, 0.0));
  float hy = silhouette(p + vec2(0.0, d2.y)) - silhouette(p - vec2(0.0, d2.y));
  float edge = clamp(length(vec2(gx, gy)) * 1.2, 0.0, 1.0);
  float halo = clamp(length(vec2(hx, hy)) * 0.6, 0.0, 1.0);
  float reveal = clamp(inside * show + lmEaseInOutSine(clamp((progress - 0.85) / 0.15, 0.0, 1.0)), 0.0, 1.0);
  float settle = 1.0 + 0.08 * (1.0 - grow) * (1.0 - grow);
  vec4 to = getToColor(c + (uv - c) / settle);
  vec4 col = mix(getFromColor(uv), to, reveal);
  float env = smoothstep(0.0, 0.1, progress) * (1.0 - smoothstep(0.7, 1.0, progress));
  vec3 light = lmToLinear(borda) * (edge * 1.3 + halo * 0.35) * brilho * env;
  return vec4(addGlow(col.rgb, light), col.a);
}
