// Desfoque radial (zoom blur): cada ponto junta a imagem no caminho até o centro, em luz linear. As amostras são
// espalhadas por pixel (ruído intercalado) e lidas de um nível de detalhe que acompanha o passo entre elas, então o
// rastro fica liso, sem cópias nem chuvisco, mesmo com força máxima e em 4K. Perto do centro continua nítido.

vec4 effect(vec2 uv) {
  float k = strength * 0.25;
  if (k <= 0.0) return getColor(uv);
  vec2 d = uv - center;
  const int N = 40;
  float lenPx = length(d * vec2(ratio, 1.0)) * k * resolution.y;
  float level = clamp(log2(max(lenPx / float(N) * 1.2, 1.0)), 0.0, 5.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + jitter) / float(N);
    vec4 s = getColorLod(center + d * (1.0 - k * t), level);
    s.rgb = lmToLinear(s.rgb);
    // O rastro enfraquece para o lado do centro (como o zoom de lente), sem ponta dura.
    float w = 1.0 - 0.45 * t;
    sum += s * w;
    total += w;
  }
  sum /= total;
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
