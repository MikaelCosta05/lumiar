// Caleidoscópio: a imagem se dobra em espelhos (fatias iguais na tela, na proporção certa), gira e se aproxima
// com aceleração, troca de clipe no auge das dobras (mistura em luz linear) e se desdobra no próximo clipe.
// As dobras nascem no centro e se abrem até os cantos (e voltam): dentro do círculo, o caleidoscópio; fora, a
// imagem normal; na borda, uma mistura suave das duas cores (nunca uma mistura das posições, que esticaria a
// imagem em riscos). Fora da tela a imagem é espelhada, nunca esticada.

vec2 mirrorUv(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec3 clipAt(vec2 q, float m) {
  return mix(lmToLinear(getFromColor(q).rgb), lmToLinear(getToColor(q).rgb), m);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  // Força das dobras: 0 → 1 no meio → 0, com aceleração nos dois sentidos.
  float s = lmEaseInOutCubic(min(progress, 1.0 - progress) * 2.0);
  float spin = lmEaseInOutCubic(progress) * 2.0;
  float m = smoothstep(0.35, 0.65, progress);
  vec2 p = lmCentered(uv) * (1.0 - 0.22 * s);
  float r = length(p);
  float seg = 2.0 * PI / max(floor(segments + 0.5), 1.0);
  float ka = abs(mod(atan(p.y, p.x) + spin, seg) - seg * 0.5);
  vec2 folded = vec2(cos(ka), sin(ka)) * r;
  // Raio do caleidoscópio: do centro (s = 0) até além dos cantos (s = 1), com borda macia.
  const float band = 0.22;
  float reach = s * (0.5 * length(vec2(ratio, 1.0)) + band);
  float inside = 1.0 - smoothstep(reach - band, reach, r);
  vec3 col = clipAt(mirrorUv(lmUncentered(folded)), m);
  if (inside < 1.0) col = mix(clipAt(mirrorUv(lmUncentered(p)), m), col, inside);
  return vec4(lmToSrgb(col), 1.0);
}
