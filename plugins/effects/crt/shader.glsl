// TV de tubo (CRT): vidro curvo, imagem de 240 linhas desenhada por um feixe e uma grade de abertura (Trinitron).
// - Curvatura com a proporção certa e canto arredondado sem serrilhado (a moldura preta do tubo);
// - cada linha é um feixe gaussiano que engorda na luz: no escuro as linhas aparecem, no claro quase fecham;
// - grade de abertura RGB fixa no vidro (não acompanha a curvatura), em luz linear e com o brilho compensado;
// - leve erro de convergência para as bordas, halo do vidro (bloom) e vinheta do tubo.
// As linhas e a grade somem quando a tela é pequena demais para mostrá-las sem moiré (miniatura).

const float SCAN = 240.0;

/** Uma linha do feixe: lê a imagem na altura da linha com a suavidade horizontal do feixe. */
vec3 beamLine(float x, float y, float conv) {
  vec2 o = lmPxUv(1.4);
  vec3 l = lmToLinear(getColor(vec2(x - o.x, y)).rgb);
  vec3 c = lmToLinear(getColor(vec2(x, y)).rgb);
  vec3 r = lmToLinear(getColor(vec2(x + o.x, y)).rgb);
  vec3 col = 0.25 * l + 0.5 * c + 0.25 * r;
  // Convergência: o vermelho chega um pouco depois, o azul um pouco antes, mais nas bordas.
  col.r = mix(col.r, 0.5 * c.r + 0.5 * (conv > 0.0 ? r.r : l.r), abs(conv));
  col.b = mix(col.b, 0.5 * c.b + 0.5 * (conv > 0.0 ? l.b : r.b), abs(conv));
  return col;
}

vec3 beamWeight(float d, vec3 lum) {
  // Largura do feixe (em linhas): fino no escuro, largo no claro.
  vec3 sigma = mix(vec3(0.22), vec3(0.48), sqrt(clamp(lum, 0.0, 1.0)));
  // Dividir pela área do feixe mantém o brilho médio da linha.
  return exp(-0.5 * d * d / (sigma * sigma)) / (sigma * 2.5066);
}

vec4 effect(vec2 uv) {
  // Curvatura do vidro (esférica) e um pequeno zoom para o meio das bordas ficar no lugar.
  vec2 c = lmCentered(uv);
  float k = curvature * 0.16;
  vec2 cq = c * (1.0 + k * dot(c, c)) / (1.0 + k * 0.25);
  vec2 q = lmUncentered(cq);

  // Moldura do tubo: retângulo de canto arredondado, borda de 1 px suavizada.
  float corner = mix(0.012, 0.06, curvature);
  float sd = lmSdRoundBox(cq, vec2(ratio * 0.5, 0.5), corner);
  float screen = lmFill(sd);
  if (screen <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);

  float conv = cq.x / (ratio * 0.5) * 0.35;
  float pitch = resolution.y / SCAN;
  float showLines = lines * smoothstep(1.8, 3.0, pitch);

  // Feixe: as duas linhas mais próximas, cada uma com a cor do centro dela.
  float ly = q.y * SCAN;
  float i0 = floor(ly - 0.5) + 0.5;
  float d0 = ly - i0;
  vec3 c0 = beamLine(q.x, i0 / SCAN, conv);
  vec3 c1 = beamLine(q.x, (i0 + 1.0) / SCAN, conv);
  vec3 beams = c0 * beamWeight(d0, c0) + c1 * beamWeight(1.0 - d0, c1);
  vec3 flat_ = beamLine(q.x, q.y, conv);
  vec3 col = mix(flat_, beams, showLines);

  // Grade de abertura: listras R, G e B no vidro (px da tela), em luz linear; média 1 (não escurece).
  float triad = lmPx(4.5) * resolution.y;
  float showMask = lines * smoothstep(2.0, 3.0, triad) * 0.8;
  float ph = gl_FragCoord.x / triad * 6.28318530718;
  vec3 mask = 1.0 + showMask * vec3(cos(ph), cos(ph - 2.0943951), cos(ph - 4.1887902));
  col *= mask;

  // Halo do vidro: a luz forte se espalha um pouco.
  col += lmBloom(q, 0.55, 0.45) * 0.35;

  // Vinheta do tubo (o feixe perde força para os cantos).
  col *= lmVignette(q, 0.45, 0.6);

  vec3 outc = lmSoftClip(lmToSrgb(col), 0.85);
  return vec4(outc * screen, 1.0);
}
