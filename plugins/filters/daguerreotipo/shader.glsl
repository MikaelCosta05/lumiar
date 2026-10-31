// Daguerreótipo (c. 1840): imagem de amálgama de prata sobre uma placa de cobre prateada e polida como espelho.
// - A placa iodada só via o azul e o violeta: o vermelho sai escuro, o azul sai branco (soma em luz linear).
// - Tons: as luzes são o "gelo" branco-creme da amálgama, as sombras são a prata polida, que reflete escuro e
//   levemente azulada; um brilho especular atravessa a placa na diagonal, mais visível nas sombras (o espelho).
// - Detalhe nítido (sem grão: não há grão num daguerreótipo), linhas finíssimas do polimento da placa.
// - "Vinheta": a moldura oval de latão do estojo escurece as bordas, com a proporção certa.
// - "Oxidação": o manchado da prata que avança das bordas para dentro, com as cores de película fina (âmbar,
//   magenta, azul-pavão) que o óxido forma, contorno orgânico (fbm) e algumas manchas e pontos de corrosão.

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

bool inGamut(vec3 lin) { return all(greaterThanEqual(lin, vec3(-1e-4))) && all(lessThanEqual(lin, vec3(1.0001))); }
vec3 okToSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  if (inGamut(lmFromOklab(lab))) return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    if (inGamut(lmFromOklab(vec3(lab.x, lab.yz * m)))) lo = m; else hi = m;
  }
  return clamp(lmToSrgb(lmFromOklab(vec3(lab.x, lab.yz * lo))), 0.0, 1.0);
}
vec3 toneGray(float v, vec2 ab) { return okToSrgb(vec3(pow(lmToLinear(vec3(v)).x, 1.0 / 3.0), ab)); }

/**
 * Cor do óxido pela espessura "t" (0 a 1), na ordem das cores de interferência de primeira ordem que a prata
 * forma ao manchar: palha, âmbar, magenta e azul-pavão (sem o verde, que só aparece em camadas muito grossas).
 */
vec3 tarnishColor(float t) {
  vec3 straw = vec3(0.95, 0.86, 0.66);
  vec3 amber = vec3(0.8, 0.56, 0.3);
  vec3 magenta = vec3(0.62, 0.34, 0.52);
  vec3 peacock = vec3(0.26, 0.38, 0.62);
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 a = mix(straw, amber, smoothstep(0.0, 1.0, t));
  vec3 b = mix(a, magenta, smoothstep(1.0, 2.0, t));
  return mix(b, peacock, smoothstep(2.0, 3.0, t));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = lmCentered(uv);
  vec2 px = p * 1080.0;
  float y = dot(lmToLinear(c.rgb), vec3(0.05, 0.33, 0.62));
  float v = lmToSrgb(vec3(y)).x;
  float l = mix(0.075, 0.9, paperCurve(v, 3.4, 0.5));
  // Espelho: brilho diagonal largo sobre as sombras.
  float sheen = exp(-pow(dot(p, normalize(vec2(1.0, 0.55))) + 0.12, 2.0) * 7.0);
  l += sheen * (1.0 - l) * 0.07;
  // Riscos finos do polimento (quase horizontais).
  float polish = lmNoise(vec2(px.x * 0.004, px.y * 0.9 + px.x * 0.02));
  l += polish * 0.012;
  // Sombras azuladas da prata, luzes creme da amálgama.
  vec2 ab = mix(vec2(-0.004, -0.013), vec2(0.004, 0.014), smoothstep(0.25, 0.85, l)) * smoothstep(0.0, 0.12, l);
  vec3 col = toneGray(l, ab);
  // Moldura oval do estojo (superelipse que acompanha a proporção do quadro).
  vec2 q = abs(p) / vec2(0.5 * ratio, 0.5);
  float oval = pow(pow(q.x, 3.0) + pow(q.y, 3.0), 1.0 / 3.0);
  float vigMask = smoothstep(0.62, 1.08, oval);
  col *= 1.0 - vigMask * 0.78 * vig;
  // Oxidação: avança das bordas com contorno de fbm; mais grossa (mais azul) perto da moldura.
  float n = lmFbm(p * 3.2 + 5.3, 5);
  float reach = oval + n * 0.22;
  float t = smoothstep(0.7, 0.98, reach) * tarnish;
  float thickness = smoothstep(0.7, 1.12, reach) + lmFbm(p * 8.0 + 1.7, 3) * 0.15;
  vec3 tarnished = col * tarnishColor(thickness) * 1.08;
  col = mix(col, tarnished, t);
  // Manchas e pontos de corrosão (esparsos, redondos, borda suave).
  vec2 cellP = px / 26.0;
  vec2 cell = floor(cellP);
  vec3 h = lmHash3(cell);
  float spotR = mix(0.04, 0.16, h.y);
  float sd = length(fract(cellP) - (0.25 + 0.5 * h.yz)) - spotR;
  float spot = (1.0 - smoothstep(-0.03, 0.03, sd)) * step(h.x, 0.008 + 0.03 * smoothstep(0.6, 1.0, reach));
  col = mix(col, mix(vec3(0.82, 0.8, 0.74), vec3(0.18, 0.14, 0.1), step(0.5, h.z)), spot * 0.55 * tarnish);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
