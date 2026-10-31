// Painéis: três painéis do próximo clipe entram um depois do outro, alternando de baixo e de cima, por cima do
// atual (que escurece e recebe a sombra de cada painel). Aceleração quíntica e desfoque de movimento vertical.

float travel(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float idx = min(floor(uv.x * 3.0), 2.0);
  float start = idx * 0.15;
  float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;
  float e = travel((progress - start) / 0.7);

  // O clipe de baixo: escurece com o painel e recebe a sombra da borda que chega.
  vec3 under = lmToLinear(getFromColor(uv).rgb) * mix(1.0, 0.45, e);
  float gap = dir > 0.0 ? uv.y - e : (1.0 - e) - uv.y;
  under *= 1.0 - exp(-max(gap, 0.0) / lmPx(70.0)) * 0.6 * smoothstep(0.0, 0.12, e);

  // Tenda de 3% da transição ≈ obturador de 180° numa transição de 0,8 s a 30 quadros/s: rastro só onde anda
  // rápido, a imagem continua legível.
  const float shutter = 0.03;
  float t0 = (progress - shutter * 0.5 - start) / 0.7;
  float t1 = (progress + shutter * 0.5 - start) / 0.7;
  float px = abs(travel(t1) - travel(t0)) * resolution.y;
  int n = int(clamp(ceil(px / 2.5), 1.0, 32.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 2.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float y = uv.y + dir * (1.0 - travel(mix(t0, t1, tent((float(i) + jitter) / float(n)))));
    sum += y >= 0.0 && y <= 1.0 ? lmToLinear(getToColorLod(vec2(uv.x, y), lod).rgb) : under;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
