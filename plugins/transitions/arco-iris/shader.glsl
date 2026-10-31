// Arco-íris: uma faixa de luz em espectro contínuo (vermelho na frente, violeta atrás) atravessa a tela na
// diagonal com aceleração. A luz soma como luz (com as altas luzes comprimidas), a imagem refrata de leve dentro
// da faixa como num prisma, e a troca de clipe acontece escondida no meio dela. "Largura" = meia largura.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  vec2 dir = normalize(vec2(1.0, 0.3));
  float c = dot(p, dir);
  float ext = abs(dir.x) * ratio * 0.5 + abs(dir.y) * 0.5;  // até o canto mais longe
  float w = width * ratio;  // meia largura em altura de tela
  float pos = mix(-ext - w, ext + w, lmEaseInOutCubic(progress));
  float k = (c - (pos - w)) / (2.0 * w);  // 0 atrás da faixa, 1 na frente
  if (k <= 0.0) return getToColor(uv);
  if (k >= 1.0) return getFromColor(uv);
  // Prisma: desloca a imagem ao longo da faixa, mais no meio.
  float bell = sin(k * PI);
  vec2 bend = dir * (k - 0.5) * bell * lmPx(14.0) * vec2(1.0 / ratio, 1.0);
  vec4 from = getFromColor(uv + bend);
  vec4 to = getToColor(uv + bend);
  vec3 base = mix(to.rgb, from.rgb, smoothstep(0.3, 0.7, k));
  // Espectro: vermelho (k = 1) → violeta (k = 0).
  vec3 hue = lmHsvToRgb(vec3((1.0 - k) * 0.78, 0.85, 1.0));
  vec3 light = lmToLinear(hue) * pow(bell, 1.5) * 0.9 + vec3(1.0) * pow(bell, 8.0) * 0.25;
  // Em cima da imagem, a faixa também tinge: um pouco de cor por multiplicação, como luz filtrada.
  base = mix(base, base * mix(vec3(1.0), lmHsvToRgb(vec3((1.0 - k) * 0.78, 0.6, 1.0)), 0.6), bell);
  return vec4(addGlow(base, light), mix(to.a, from.a, step(0.5, k)));
}
