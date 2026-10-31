// Ondulação: ondas circulares saem do centro como uma gota na água (círculos de verdade, com a proporção da tela)
// e andam para fora; a superfície refrata a imagem (deslocamento radial), as cristas pegam um pouco de luz e as
// ondas enfraquecem com a distância. A força sobe e desce em curva suave e a troca de clipe é uma mistura em luz
// linear no meio. O que sairia do quadro é espelhado.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float d = length(p);
  vec2 dir = p / max(d, 1e-5);
  float env = sin(progress * PI);
  env *= env;
  float phase = d * frequency - progress * 30.0;
  // Mais fraca longe do centro; some no próprio centro (sem bico).
  float fall = smoothstep(0.0, 0.08, d) / (1.0 + 2.5 * d);
  float strength = amplitude * 0.55 * env * fall;
  vec2 offset = dir * sin(phase) * strength / vec2(ratio, 1.0);
  vec2 q = mirrorUv(uv + offset);
  float m = smoothstep(0.3, 0.7, progress);
  vec3 lin = mix(lmToLinear(getFromColor(q).rgb), lmToLinear(getToColor(q).rgb), m);
  // Crista iluminada e cava levemente mais escura (a inclinação da água).
  float slope = cos(phase) * clamp(strength * 12.0, 0.0, 1.0);
  lin *= 1.0 + 0.18 * slope;
  return vec4(lmToSrgb(lin), 1.0);
}
