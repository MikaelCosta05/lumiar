// Colmeia: a imagem vira um mosaico de hexágonos (regulares na tela) que crescem com aceleração; no meio,
// cada hexágono troca para o próximo clipe com o seu atraso, nascendo do centro da célula com um pequeno
// "pulo"; depois a colmeia se desfaz no próximo clipe. A cor de cada hexágono é a média da região (mapa de
// níveis), sem cintilar, e as juntas entre eles são finas e antisserrilhadas.

/** Hexágono regular com lados retos em x = ±r (pontas em cima e embaixo); negativo = dentro. */
float sdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p.yx);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

/** Centro do hexágono mais próximo (grade de espaçamento 1 na horizontal). */
vec2 hexCenter(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  return dot(a, a) < dot(b, b) ? p - a : p - b;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  // Força do mosaico: sobe até 0,4, segura e desce a partir de 0,6.
  float s = lmEaseInOutCubic(clamp(progress / 0.4, 0.0, 1.0)) * (1.0 - lmEaseInOutCubic(clamp((progress - 0.6) / 0.4, 0.0, 1.0)));
  float spacing = max(s, 0.02) / cells;  // distância entre hexágonos, em altura de tela
  vec2 p = lmCentered(uv) / spacing;
  vec2 c = hexCenter(p);
  vec2 local = p - c;
  vec2 cuv = lmUncentered(c * spacing);
  float level = max(log2(spacing * resolution.y) - 0.5, 0.0);
  vec3 fromMosaic = getFromColorLod(cuv, level).rgb;
  vec3 toMosaic = getToColorLod(cuv, level).rgb;

  // Troca de cada hexágono: atraso pelo acaso e pela distância ao centro, com um pulo (ease out back).
  float far = 0.5 * length(vec2(ratio, 1.0));
  float order = mix(lmHash(c + 0.5), clamp(length(c * spacing) / far, 0.0, 1.0), 0.5);
  float t = clamp((progress - (0.38 + 0.14 * order)) / 0.08, 0.0, 1.0);
  float pxCell = 1.0 / (spacing * resolution.y);  // um pixel, em células
  float grow = t >= 1.0 ? 2.0 : max(lmEaseOutBack(t), 0.0) * 0.5;
  float inner = clamp(0.5 - sdHex(local, grow) / (1.5 * pxCell), 0.0, 1.0) * step(0.001, t);
  vec3 mosaic = mix(fromMosaic, toMosaic, inner);
  // Juntas finas (1,5 px de 1080p) que aparecem com o mosaico.
  float d = sdHex(local, 0.5);
  float joint = smoothstep(-lmPx(1.5) / spacing - pxCell, -lmPx(1.5) / spacing, d) * smoothstep(0.5, 1.0, s);
  mosaic *= 1.0 - 0.35 * joint;

  // Antes do meio, o mosaico sai do clipe atual; depois, volta para o próximo.
  vec4 orig = progress < 0.5 ? getFromColor(uv) : getToColor(uv);
  float amount = smoothstep(0.0, 0.35, s);
  return vec4(mix(orig.rgb, mosaic, amount), orig.a);
}
