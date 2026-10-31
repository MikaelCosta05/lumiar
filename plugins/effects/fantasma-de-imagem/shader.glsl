// Fantasma de imagem (sinal com multipercurso): além do sinal direto, a antena recebe o mesmo sinal refletido
// num prédio ou morro, que chega um pouco depois e mais fraco. Na tela isso é uma cópia deslocada para a direita,
// mais mole e quase sem cor (a fase da croma não bate), somada ao sinal e com o ganho da TV compensando.
// O "ringing" é a oscilação amortecida que o sinal faz depois de cada borda (claro, escuro, claro…), não um
// contorno uniforme. Quando algo se mexe no caminho (um avião, árvores), o atraso e a força do eco oscilam.

vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }

/** O eco: um pouco mais mole (o caminho refletido perde banda) e preto fora do quadro (apagamento). */
vec3 echo(vec2 uv) {
  vec2 o = lmPxUv(2.0);
  vec3 c = toYiq(getColor(uv).rgb) * 0.5 + toYiq(getColor(uv - vec2(o.x, 0.0)).rgb) * 0.25 + toYiq(getColor(uv + vec2(o.x, 0.0)).rgb) * 0.25;
  return c * step(0.0, uv.x);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 s = toYiq(base.rgb);
  // O atraso e a força do eco oscilam devagar (suave, sem saltos).
  float flutter = oscilacao * (0.35 * lmNoise(vec2(time * 1.3, 0.7)) + 0.12 * lmNoise(vec2(time * 6.0, 3.1)));
  float dx = distancia * (1.0 + flutter);
  float a1 = 0.55 * forca * (1.0 + 0.5 * flutter);
  float a2 = 0.22 * forca;
  vec3 g1 = echo(uv - vec2(dx, 0.0));
  vec3 g2 = echo(uv - vec2(dx * 2.1, 0.0));
  // O eco chega com a croma quase anulada; o segundo eco vem invertido (reflexão com troca de fase).
  g1.yz *= 0.35;
  g2.yz *= 0.0;
  // O ganho automático da TV compensa a soma: uma área lisa continua com o mesmo brilho.
  vec3 sig = (s + a1 * g1 - a2 * g2) / (1.0 + a1 - a2);

  // Ringing: oscilação amortecida depois das bordas (diferenças da luma, com sinais alternados).
  float step_ = lmPxUv(2.2).x;
  float ring = 0.0;
  float w = 1.0;
  for (int i = 0; i < 4; i++) {
    float x0 = uv.x - float(i) * step_;
    float d = lmLuma(getColor(vec2(x0, uv.y)).rgb) - lmLuma(getColor(vec2(x0 - step_, uv.y)).rgb);
    ring += d * w;
    w *= -0.62;
  }
  sig.x += ring * contorno * 0.9;

  return vec4(clamp(toRgb(sig), 0.0, 1.0), base.a);
}
