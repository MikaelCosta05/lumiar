// Círculo que cresce do centro escolhido. Borda por distância (sem serrilhado), crescimento com aceleração
// (ease in-out) e a borda borrada pela velocidade (desfoque de movimento), sombra suave do próximo clipe sobre o
// atual e um leve "assentar" do zoom no próximo clipe.

float growth(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)); }

vec4 transition(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - center) * aspect;
  // Distância até o canto mais longe: no fim o círculo cobre a tela toda.
  vec2 far = max(center, 1.0 - center) * aspect;
  float px = 1.0 / resolution.y;
  float e = growth(progress);
  // Velocidade da borda (altura por progresso) → rastro de ~meio quadro numa transição de 1 s.
  float speed = (growth(progress + 0.005) - growth(progress - 0.005)) / 0.01;
  float total = length(far) + smoothness + 2.0 * px;
  float blur = speed * total / 200.0;
  float soft = max(smoothness, 1.5 * px) + blur;
  float r = e * (total + blur);
  float d = length(p);
  float m = 1.0 - smoothstep(r - soft, r, d);

  // O próximo clipe chega com um zoom que assenta; o atual avança um pouco para dentro da tela.
  float settle = 1.0 + 0.06 * (1.0 - e) * (1.0 - e);
  vec4 to = getToColor(center + (uv - center) / settle);
  vec4 from = getFromColor(center + (uv - center) / (1.0 + 0.03 * e));
  // Sombra do disco sobre o clipe atual, só enquanto ele passa.
  float env = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.85, 1.0, progress));
  float shadow = pow(1.0 - smoothstep(r, r + 0.09, d), 2.0) * 0.22 * env;
  from.rgb *= 1.0 - shadow;
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  return mix(from, to, m);
}
