// Ajuste de cor como num corretor de cor: brilho como exposição (em luz linear: os pretos continuam pretos e, para
// cima, as altas luzes encostam no branco devagar em vez de cortar), contraste por curva em S em volta do cinza médio
// (sem estourar nem esmagar nas pontas), saturação em Oklab (muda a cor sem mudar o brilho percebido) e temperatura
// pelo balanço de branco (luminância preservada).

float contrastCurve(float x, float k) {
  x = clamp(x, 0.0, 1.0);
  if (k <= 1.0) return mix(0.5, x, k);
  float a = pow(x, k);
  float b = pow(1.0 - x, k);
  return a / max(a + b, 1e-6);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // Brilho: ±1,25 ponto de exposição, mais um toque nos pretos (como o "brilho" dos editores).
  vec3 lin = lmToLinear(c.rgb) * exp2(brightness * 2.5);
  vec3 col = lmToSrgb(lin) + brightness * 0.06;
  // Ombro só quando clareia: o que passaria do branco é comprimido.
  float knee = 1.0 - 0.3 * smoothstep(0.0, 0.25, brightness);
  col = knee < 1.0 ? lmSoftClip(col, knee) : col;
  col = clamp(col, 0.0, 1.0);
  col = vec3(contrastCurve(col.r, contrast), contrastCurve(col.g, contrast), contrastCurve(col.b, contrast));
  vec3 lab = lmToOklab(lmToLinear(col));
  lab.yz *= saturation;
  col = lmToSrgb(max(lmFromOklab(lab), 0.0));
  col = lmWhiteBalance(clamp(col, 0.0, 1.0), temperature, 0.0);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
