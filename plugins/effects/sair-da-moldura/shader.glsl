// Sair da moldura: o vídeo vira um quadro menor, deitado para trás, e a pessoa salta para fora da borda.
// - Perspectiva de verdade: o quadro é um plano girado em torno do eixo horizontal e projetado por uma câmera
//   (a imagem dentro dele encurta de forma correta, não só um trapézio esticado).
// - Bordas do quadro, da moldura branca e da sombra antisserrilhadas pela derivada do pixel.
// - Fundo com o próprio vídeo num desfoque gaussiano limpo (5×5 leituras de um nível de detalhe), sem as cópias
//   fantasmas do anel de 12 amostras.
vec3 blurred(vec2 uv) {
  float sigma = 22.0 * resolution.y / 1080.0;          // σ em pixels da tela
  float lod = max(log2(sigma / 1.5), 0.0);
  vec2 st = vec2(sigma) / resolution;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      float w = exp(-dot(o, o) * 0.5);
      sum += lmToLinear(getColorLod(clamp(uv + o * st, 0.0, 1.0), lod).rgb) * w;
      total += w;
    }
  }
  return lmToSrgb(sum / total);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec2 center = vec2(posicao.x, 1.0 - posicao.y);
  vec2 halfSize = vec2(tamanho * 0.5 * ratio, tamanho * 0.5);   // em unidades de altura
  vec2 s = (uv - center) * vec2(ratio, 1.0);

  // Plano girado de θ (o topo vai para trás), câmera a F alturas de distância.
  float theta = inclinacao * 0.6;
  float F = 1.6;
  float den = F * cos(theta) - s.y * sin(theta);
  float Y = s.y * F / max(den, 1e-4);
  float X = s.x * (F + Y * sin(theta)) / F;
  vec2 plane = vec2(X, Y) / halfSize;
  bool valid = den > 1e-4;
  vec2 content = 0.5 + plane * 0.5 * recorte;

  vec3 col = mix(fundo, blurred(uv) * 0.45, fundoVideo);
  // Sombra suave embaixo e à direita do quadro.
  vec2 sp = abs(plane - vec2(0.04, -0.06)) - 1.0;
  float shadowDist = length(max(sp, 0.0)) + min(max(sp.x, sp.y), 0.0);
  if (valid) col *= 1.0 - sombra * 0.7 * (1.0 - smoothstep(0.0, 0.18, shadowDist));

  float border = borda * 0.05;
  float box = max(abs(plane.x), abs(plane.y)) - 1.0;       // < 0 dentro do vídeo
  float w = max(fwidth(box), 1e-5);
  float frameMask = valid ? 1.0 - smoothstep(border - w * 0.5, border + w * 0.5, box) : 0.0;
  float videoMask = valid ? 1.0 - smoothstep(-w * 0.5, w * 0.5, box) : 0.0;
  col = mix(col, vec3(0.96), frameMask);
  col = mix(col, getColor(clamp(content, 0.0, 1.0)).rgb, videoMask);

  // A pessoa passa por cima da borda (menos embaixo, para não ficar com as pernas soltas).
  bool inContent = content.x >= 0.0 && content.x <= 1.0 && content.y >= 0.0 && content.y <= 1.0;
  if (valid && videoMask < 1.0 && plane.y > -1.0 && inContent) {
    float p = getPerson(content);
    col = mix(col, getColor(content).rgb, p * (1.0 - videoMask));
  }
  return vec4(col, base.a);
}
