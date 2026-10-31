// Losango que cresce do centro (um quadrado a 45°, com lados iguais na tela). Borda por distância, crescimento
// com aceleração e desfoque de movimento na borda, sombra suave e zoom que assenta no próximo clipe.

float growth(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)); }

vec4 transition(vec2 uv) {
  vec2 p = lmCentered(uv);
  float px = 1.0 / resolution.y;
  // Distância (de verdade, em altura de tela) até a borda do losango de "raio" r: (|x| + |y| − r) / √2.
  float diag = (abs(p.x) + abs(p.y)) * 0.70710678;
  float e = growth(progress);
  float speed = (growth(progress + 0.005) - growth(progress - 0.005)) / 0.01;
  float total = (ratio + 1.0) * 0.5 * 0.70710678 + smoothness + 2.0 * px;
  float blur = speed * total / 200.0;
  float soft = max(smoothness, 1.5 * px) + blur;
  float r = e * (total + blur);
  float m = 1.0 - smoothstep(r - soft, r, diag);

  float settle = 1.0 + 0.06 * (1.0 - e) * (1.0 - e);
  vec4 to = getToColor(0.5 + (uv - 0.5) / settle);
  vec4 from = getFromColor(0.5 + (uv - 0.5) / (1.0 + 0.03 * e));
  float env = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.85, 1.0, progress));
  from.rgb *= 1.0 - pow(1.0 - smoothstep(r, r + 0.09, diag), 2.0) * 0.22 * env;
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  return mix(from, to, m);
}
