/**
 * Zoom infinito: o próximo clipe está "escondido" dentro do atual, num quadradinho 1/profundidade em volta do
 * ponto. A câmera mergulha (escala exponencial, que aos olhos anda em velocidade constante, com aceleração
 * cúbica nas pontas) até ele ocupar a tela inteira, e o ponto vai para o centro durante o caminho.
 * O desfoque de movimento integra o próprio mergulho no tempo do obturador (até 32 instantes com ruído
 * intercalado, cada um lendo o nível de detalhe do tamanho do passo): rastro liso, sem cópias.
 * O que sairia do quadro é espelhado, nunca a borda esticada.
 */

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec3 frameAt(vec2 uv, float e, float lodA, float lodB) {
  vec2 point = vec2(ponto.x, 1.0 - ponto.y);
  float scale = pow(profundidade, e);
  vec2 view = mix(point, vec2(0.5), e);
  vec2 a = point + (uv - view) / scale;
  vec2 b = (a - point) * profundidade + 0.5;
  vec3 col = lmToLinear(getFromColorLod(mirrorUv(a), lodA).rgb);
  float edge = min(min(b.x, 1.0 - b.x), min(b.y, 1.0 - b.y));
  // Entra aos poucos e com a borda suave (nunca um retângulo recortado); no fim do mergulho o próximo clipe
  // (espelhado além da borda) cobre também a moldura, e em e = 1 ocupa a tela exatamente.
  float alpha = max(smoothstep(0.0, 0.3, edge), smoothstep(0.72, 1.0, e)) * smoothstep(0.4, 0.9, e);
  if (alpha > 0.0) col = mix(col, lmToLinear(getToColorLod(mirrorUv(b), lodB).rgb), alpha);
  return col;
}

float dive(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float e = dive(progress);
  float shutter = 0.07 * desfoque;
  float e0 = dive(progress - shutter * 0.5);
  float e1 = dive(progress + shutter * 0.5);
  // Quanto este pixel anda na tela durante o obturador (zoom + o ponto indo ao centro), em pixels.
  vec2 point = vec2(ponto.x, 1.0 - ponto.y);
  float px = (length((uv - mix(point, vec2(0.5), e)) * resolution) * log(profundidade) + length((vec2(0.5) - point) * resolution)) * abs(e1 - e0);
  int n = int(clamp(ceil(px / 2.5), 1.0, 32.0));
  float spacing = px / float(n);
  float scale = pow(profundidade, e);
  float lodA = clamp(log2(max(spacing / scale, 1.0)) - 1.0, 0.0, 5.0);
  float lodB = clamp(log2(max(spacing * profundidade / scale, 1.0)) - 1.0, 0.0, 5.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    sum += frameAt(uv, mix(e0, e1, tent((float(i) + jitter) / float(n))), lodA, lodB);
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
