// Holograma: projeção de luz azul, transparente, com linhas de varredura, bordas acesas e falhas de sinal.
// - Tudo é luz: a projeção soma em luz linear com as altas luzes comprimidas, e um brilho (bloom por níveis)
//   vaza em volta do que é claro.
// - Linhas de varredura em px de 1080p, subindo devagar; uma faixa de brilho mais larga varre de baixo para cima.
// - Bordas da imagem acendem (Sobel num nível suavizado), como a borda de um volume de luz.
// - Separação de cor fina, tremulação suave (ruído, não piscar a cada quadro) e falhas em rajada: faixas que
//   pulam de lado dando a volta na largura.
vec3 tap(vec2 uv) { return getColor(vec2(fract(uv.x), clamp(uv.y, 0.0, 1.0))).rgb; }

vec4 effect(vec2 uv) {
  float t = time;
  float k = resolution.y / 1080.0;
  // Falha: em rajadas curtas, faixas horizontais pulam de lado.
  float frame = floor(t * 12.0);
  float jump = step(0.93, lmHash(vec2(frame, 1.0)));
  float shift = jump * (lmHash(vec2(floor(uv.y * 30.0), frame)) - 0.5) * 0.06;
  vec2 u = vec2(uv.x + shift, uv.y);
  float split = lmPx(2.0) / ratio;
  vec3 src = getColor(uv).rgb;
  vec3 s = vec3(tap(u + vec2(split, 0.0)).r, tap(u).g, tap(u - vec2(split, 0.0)).b);
  float l = lmLuma(s);

  // Bordas acesas.
  float lod = max(log2(1.5 * k), 0.0);
  vec2 o = lmPxUv(2.0);
  float gx = lmLuma(getColorLod(u + vec2(o.x, 0.0), lod).rgb) - lmLuma(getColorLod(u - vec2(o.x, 0.0), lod).rgb);
  float gy = lmLuma(getColorLod(u + vec2(0.0, o.y), lod).rgb) - lmLuma(getColorLod(u - vec2(0.0, o.y), lod).rgb);
  float edge = smoothstep(0.03, 0.25, length(vec2(gx, gy)));

  float py = uv.y * 1080.0;
  float line = 0.5 + 0.5 * sin((py - t * 30.0) * (2.0 * PI / 6.0));
  float scan = 0.4 + 0.6 * line * line;
  // Interferência: faixas largas e fracas que rolam devagar.
  scan *= 0.88 + 0.12 * lmNoise(vec2(uv.y * 6.0 - t * 1.3, t * 0.7));
  float band = exp(-pow((fract(uv.y * 0.7 - t * 0.25) - 0.5) * 12.0, 2.0));
  float flicker = 0.9 + 0.1 * lmNoise(vec2(t * 9.0, 4.2)) - 0.25 * jump;

  vec3 tint_ = lmToLinear(tint);
  vec3 light = tint_ * (pow(lmToLinear(vec3(l)).r, 1.15) * 1.35 + 0.02) * scan;
  light += tint_ * band * 0.22 + tint_ * edge * 0.7;
  light += lmBloom(u, 0.45, 0.45) * tint_ * 1.4;
  light *= flicker;
  vec3 holo = lmSoftClip(lmToSrgb(light), 0.8);
  // Chuvisco fino do projetor.
  holo += (lmHash(vec3(floor(uv * resolution / max(k, 1.0)), floor(t * 24.0))) - 0.5) * 0.03 * tint;
  return vec4(mix(src, clamp(holo, 0.0, 1.0), opacity), 1.0);
}
