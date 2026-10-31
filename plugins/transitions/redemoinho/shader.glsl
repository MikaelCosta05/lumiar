// Redemoinho: a imagem gira como água no ralo, mais rápido perto do centro (queda suave, gaussiana, na
// proporção certa) e é puxada para dentro; o giro tem aceleração e desfoque de movimento em arco proporcional à
// velocidade; a troca acontece no auge do giro (mistura em luz linear) e o próximo clipe desenrola. Fora da tela
// a imagem é espelhada.

vec2 mirrorUv(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

float swirlOf(float t) { return lmEaseInOutCubic(min(t, 1.0 - t) * 2.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float s = swirlOf(progress);
  float ds = (swirlOf(progress + 0.004) - swirlOf(progress - 0.004)) / 0.008;
  vec2 p = lmCentered(uv);
  float fall = exp(-dot(p, p) / (2.0 * 0.33 * 0.33));
  float amount = strength * 6.0;
  float angle = amount * s * fall;
  // Arco que o ponto percorre em ~meio quadro (transição de 1 s).
  float arc = amount * abs(ds) * fall / 120.0;
  float suck = 1.0 + 0.3 * s * fall;
  float m = smoothstep(0.35, 0.65, progress);
  float jitter = lmIGN(gl_FragCoord.xy);
  int n = arc * length(p) * resolution.y > 1.5 ? 12 : 1;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    float k = n > 1 ? (float(i) + jitter) / float(n) - 0.5 : 0.0;
    vec2 q = mirrorUv(lmUncentered(lmRotate(p, angle + arc * k) * suck));
    vec3 a = lmToLinear(getFromColor(q).rgb);
    vec3 b = lmToLinear(getToColor(q).rgb);
    sum += mix(a, b, m);
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
