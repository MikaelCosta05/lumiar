// Explosão de luz: raios de luz irregulares (ruído de gradiente no círculo, não um leque de senos iguais) nascem
// do centro, se esticam e se abrem enquanto a luz cresce acelerando; a imagem é superexposta e arrastada para fora
// (desfoque radial proporcional à energia) até o clarão quase total no meio, onde a troca acontece, e tudo se
// apaga devagar no próximo clipe. A luz soma em luz linear e as altas luzes são comprimidas, sem chapar branco.

float expIn(float x, float k) { return (exp(k * x) - 1.0) / (exp(k) - 1.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float I = progress < 0.5
    ? expIn(clamp((progress - 0.12) / 0.38, 0.0, 1.0), 3.0)
    : pow(1.0 - clamp((progress - 0.5) / 0.42, 0.0, 1.0), 2.2);
  vec2 p = lmCentered(uv);
  float d = length(p);
  vec2 dir = p / max(d, 1e-5);

  // A imagem arrastada para fora do centro (só quando há energia).
  float m = smoothstep(0.47, 0.53, progress);
  float blur = 0.16 * I;
  int n = int(clamp(ceil(blur * length(resolution) * 0.5 / 4.0), 1.0, 24.0));
  vec3 img = vec3(0.0);
  if (m < 1.0) img += lmToLinear(lmZoomBlurFrom(uv, vec2(0.5), blur, n).rgb) * (1.0 - m);
  if (m > 0.0) img += lmToLinear(lmZoomBlurTo(uv, vec2(0.5), blur, n).rgb) * m;

  // Raios: ruído no círculo (sem emenda no ângulo), girando devagar, mais longos quanto mais energia.
  float t = progress * 1.2;
  float n1 = lmNoise(vec3(dir * 4.0, t)) * 0.6 + lmNoise(vec3(dir * 11.0, t * 1.7 + 3.0)) * 0.4;
  float rays = pow(clamp(n1 * 0.5 + 0.55, 0.0, 1.0), 5.0) * 2.2;
  float reach = 0.12 + 1.1 * I;
  float falloff = exp(-d / reach);
  float core = exp(-d / (0.04 + 0.25 * I));
  vec3 tintLin = lmToLinear(tint);
  vec3 light = tintLin * (rays * falloff * 1.3 + core * 1.6 + I * I * 0.6) * I;
  vec3 lin = img * (1.0 + 3.0 * I * I) + light;
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.7), smoothstep(0.0, 0.12, I));
  // No pico a luz toma a tela (a troca fica escondida).
  col = mix(col, lmSoftClip(tint * 1.05, 0.9), pow(I, 6.0) * 0.85);
  return vec4(col, 1.0);
}
