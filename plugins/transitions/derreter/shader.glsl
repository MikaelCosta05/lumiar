// Derreter (estilo Doom): o clipe escorre para baixo em colunas com gravidade (cada uma acelera), as colunas
// saem numa onda suave com um pouco de acaso (vizinhas parecidas, como no Doom), a ponta de cima de cada coluna
// fica arredondada como uma gota, com um brilho de líquido na borda, sombra no próximo clipe logo acima e
// desfoque de movimento vertical proporcional à velocidade da queda.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float n = max(floor(columns + 0.5), 1.0);
  float col = floor(uv.x * n);
  float lx = uv.x * n - col;
  // Atraso: onda suave pelas colunas + um pouco de acaso por coluna (de 0 a 0,45).
  float delay = clamp(0.3 * (0.5 + 0.5 * lmNoise(vec2(col * 0.11, 3.7))) + 0.12 * lmHash(col + 0.5), 0.0, 0.45);
  float t = clamp((progress - delay) / 0.55, 0.0, 1.0);
  float r = 0.5 * ratio / n;  // meia largura da coluna, em altura de tela
  float fall = t * t * (1.06 + 2.0 * r);
  float speed = 2.0 * t * (1.06 + 2.0 * r) / 0.55;  // altura de tela por progresso
  // Ponta de gota: semicírculo no topo da coluna, que se forma no começo da queda.
  float cap = r * smoothstep(0.0, 0.2, t);
  vec2 rel = vec2((lx - 0.5) * 2.0 * r, uv.y - (1.0 - fall - cap));
  float sd = rel.y > 0.0 ? length(vec2(rel.x * (cap / max(r, 1e-5)), rel.y)) - cap : -1.0;
  if (cap <= 1e-5) sd = uv.y - (1.0 - fall);
  float px = 1.0 / resolution.y;
  float blur = speed / 120.0;
  float cover = clamp(0.5 - sd / (1.5 * px + blur * 0.5), 0.0, 1.0);

  vec2 q = vec2(uv.x, uv.y + fall);
  vec4 from = blur > px ? lmMotionBlurFrom(q, vec2(0.0, blur), 10) : getFromColor(q);
  // Brilho de líquido logo dentro da borda.
  float sheen = (1.0 - smoothstep(0.0, lmPx(10.0), -sd)) * smoothstep(0.0, 0.1, t) * 0.18;
  from.rgb = mix(from.rgb, vec3(1.0), sheen);
  vec4 to = getToColor(uv);
  // Sombra da folha que escorre, no próximo clipe logo acima da borda.
  to.rgb *= 1.0 - 0.3 * pow(1.0 - smoothstep(0.0, lmPx(40.0), max(sd, 0.0)), 2.0) * smoothstep(0.0, 0.1, t);
  return mix(to, from, cover);
}
