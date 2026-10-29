float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 0.37)), hash(vec2(i + 1.0, 0.37)), f);
}

vec4 effect(vec2 uv) {
  float t = time * velocidade;
  float frame = floor(time * 30.0);
  // Linhas de uma fita (240 por campo), não do vídeo: o defeito tem o mesmo tamanho em qualquer resolução.
  float row = floor(uv.y * 240.0);

  // A faixa desce devagar e às vezes dá um tranco para cima.
  float center = fract(1.0 - t * 0.17 + vnoise(t * 0.8) * 0.25);
  float d = uv.y - center;
  d -= floor(d + 0.5);
  // Miolo da faixa bem bagunçado, com bordas que vão sumindo.
  float band = 1.0 - smoothstep(largura * 0.15, largura * 0.5, abs(d));
  // Logo acima da faixa as linhas ainda puxam para o lado (o "rabo" do tracking).
  float tail = d > 0.0 ? (1.0 - smoothstep(0.0, largura * 2.5, d)) * 0.35 : 0.0;
  float k = clamp(band + tail, 0.0, 1.0) * intensidade;

  float jitter = (hash(vec2(row, frame)) - 0.5) * 0.14 + 0.03;
  float wave = sin(uv.y * 90.0 + t * 7.0) * 0.006;
  vec2 u = vec2(uv.x + (jitter + wave) * k, uv.y);

  vec3 col = getColor(u).rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  // Dentro da faixa a cor some e o preto sobe.
  col = mix(col, vec3(l) * 0.85 + 0.12, band * intensidade * 0.6);

  // Riscos brancos horizontais, curtos, que piscam a cada quadro.
  float seg = floor(uv.x * 38.0 + hash(vec2(row, frame + 3.0)) * 38.0);
  float streak = step(1.0 - 0.45 * ruido * band, hash(vec2(seg, row + frame * 17.0)));
  float speck = hash(floor(uv * resolution / 2.0) + frame * 5.3);
  col = mix(col, vec3(0.92), streak * intensidade);
  col = mix(col, vec3(speck), band * ruido * intensidade * 0.35);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
