// TV antiga desligando e ligando: a imagem se achata (com aceleração) numa linha que fica cada vez mais
// clara, a linha encolhe num ponto de fósforo azulado que brilha e se apaga; no próximo clipe o mesmo ao contrário
// (o ponto acende, vira linha e abre). Bordas antisserrilhadas e brilho somado como luz, sem estourar.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  bool off = progress < 0.5;
  float q = off ? progress * 2.0 : (1.0 - progress) * 2.0;  // 0 = imagem cheia, 1 = apagada
  float px = 1.0 / resolution.y;
  float squash = lmEaseInCubic(clamp(q / 0.5, 0.0, 1.0));
  float shrink = lmEaseInCubic(clamp((q - 0.45) / 0.35, 0.0, 1.0));
  float fade = lmEaseOutCubic(clamp((q - 0.78) / 0.22, 0.0, 1.0));
  float hy = mix(0.5, lmPx(2.0), squash);
  float hx = mix(ratio * 0.5, lmPx(3.0), shrink);
  vec2 p = lmCentered(uv);
  float sd = lmSdBox(p, vec2(hx, hy));
  float cover = clamp(0.5 - sd / px, 0.0, 1.0);
  // A imagem comprimida: o mapa de níveis evita o serrilhado quando ela vira uma linha.
  vec2 suv = vec2(0.5) + p / vec2(hx, hy) * vec2(0.5 / ratio, 0.5);
  float level = clamp(log2(0.5 / hy), 0.0, 9.0);
  vec4 img = off ? getFromColorLod(suv, level) : getToColorLod(suv, level);
  // Quanto mais achatada, mais clara (a energia do feixe fica concentrada).
  vec3 phosphor = vec3(0.86, 0.93, 1.0);
  float hot = smoothstep(0.15, 1.0, squash);
  vec3 inner = mix(img.rgb, phosphor, hot * 0.85) * (1.0 - fade);
  vec3 col = inner * cover;
  // Brilho em volta da linha/ponto.
  float energy = hot * (1.0 - fade) * (0.6 + 0.8 * shrink);
  float glow = exp(-max(sd, 0.0) / lmPx(14.0)) * 0.5 + exp(-max(sd, 0.0) / lmPx(60.0)) * 0.18;
  col = addGlow(col, lmToLinear(phosphor) * glow * energy);
  return vec4(col, 1.0);
}
