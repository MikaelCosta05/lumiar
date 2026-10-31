// Empilhar: o próximo clipe sobe por cima como uma carta jogada na pilha. O atual recua (encolhe e escurece,
// como se ficasse embaixo), recebe a sombra da carta que chega, e a carta tem desfoque de movimento vertical
// proporcional à velocidade. Aceleração quíntica.

float travel(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float e = travel(progress);

  // O clipe de baixo recua para a mesa (fundo escuro), com a borda suavizada.
  float scale = 1.0 - 0.1 * e;
  vec2 qa = (uv - 0.5) / scale + 0.5;
  vec4 a = getFromColor(clamp(qa, 0.0, 1.0));
  float cover = lmFill(lmSdBox(lmCentered(qa), vec2(ratio * 0.5, 0.5)));
  vec3 under = lmToLinear(a.rgb) * mix(1.0, 0.4, e) * cover;
  // Sombra da carta à frente da borda de cima.
  float above = uv.y - e;
  under *= 1.0 - exp(-max(above, 0.0) / lmPx(80.0)) * 0.65 * smoothstep(0.0, 0.12, e);

  // Tenda de 3% da transição ≈ obturador de 180° numa transição de 0,8 s a 30 quadros/s: rastro só onde anda
  // rápido, a imagem continua legível.
  const float shutter = 0.03;
  float t0 = progress - shutter * 0.5;
  float t1 = progress + shutter * 0.5;
  float px = abs(travel(t1) - travel(t0)) * resolution.y;
  int n = int(clamp(ceil(px / 2.5), 1.0, 40.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 2.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    float t = mix(t0, t1, tent((float(i) + jitter) / float(n)));
    float y = uv.y + 1.0 - travel(t);
    sum += y <= 1.0 ? lmToLinear(getToColorLod(vec2(uv.x, y), lod).rgb) : under;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
