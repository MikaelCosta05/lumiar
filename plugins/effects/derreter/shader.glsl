// Derreter: a imagem escorre em gotas a partir do topo.
// - A borda de cima fica presa e o resto estica para baixo: cada ponto busca a imagem mais perto do topo, então
//   nada é lido de fora do quadro (sem a faixa esticada do topo).
// - Cada coluna tem uma gota de largura, posição e comprimento próprios: laterais retas e ponta arredondada, como
//   tinta escorrendo, com a borda lateral antisserrilhada. O comprimento evolui devagar (ruído suave no tempo).
// - Por baixo de tudo, a massa inteira cede um pouco, e o escorrido ganha um brilho úmido na lateral das gotas.
float field(float x, float t, float aa) {
  float i = floor(x);
  float sag = (lmNoise(vec2(x * 0.11 + 5.0, t * 0.6)) * 0.5 + 0.5) * 0.3;
  float best = sag;
  for (int k = -1; k <= 1; k++) {
    float j = i + float(k);
    float r = lmHash(j + 0.5);
    float w = 0.26 + 0.2 * lmHash(j + 3.7);                       // meia largura, em colunas
    float h = pow(lmNoise(vec2(j * 0.37, t + r * 10.0)) * 0.5 + 0.5, 1.4);
    float u = abs(x - (j + 0.5 + (r - 0.5) * 0.4)) / w;
    float tip = sqrt(max(1.0 - u * u, 0.0));
    float d = h - 0.08 * (1.0 - tip);                             // ponta redonda
    float cover = 1.0 - smoothstep(1.0 - aa / w, 1.0, u);         // lateral sem serrilhado
    best = max(best, mix(sag, d, cover));
  }
  return best;
}

vec4 effect(vec2 uv) {
  float x = uv.x * columns;
  float t = time * speed * 0.35;
  float aa = max(fwidth(x), 1e-4) * 1.2;
  float D = amount * 0.6 * field(x, t, aa);
  float s = 1.0 - uv.y;                                           // 0 no topo
  float src = s / (1.0 + D * 1.4);
  vec4 c = getColor(vec2(uv.x, 1.0 - src));
  // Brilho úmido: onde a gota muda de comprimento de lado a lado, a luz pega na lateral.
  float e = 0.12;
  float slope = (field(x + e, t, aa) - field(x - e, t, aa)) / (2.0 * e) * amount;
  float wet = smoothstep(0.03, 0.4, s - src);                     // só onde já escorreu
  c.rgb = clamp(c.rgb * (1.0 + clamp(slope, -1.0, 1.0) * 0.1 * wet) + max(slope, 0.0) * 0.04 * wet, 0.0, 1.0);
  return c;
}
