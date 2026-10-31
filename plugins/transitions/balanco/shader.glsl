// Cair: o clipe tomba preso pelo canto de baixo à esquerda, como uma placa que solta do outro prego: o lado
// livre cai, começando quase parado e acelerando como na queda de verdade (ângulo ~ t^2,6), e sai por baixo do
// quadro em ~96°. O giro tem desfoque de
// movimento em arco (integrado no tempo do obturador, proporcional à velocidade em cada ponto), sem deformar a
// proporção, e projeta uma sombra suave sobre o próximo clipe, que sai da penumbra.

float angleAt(float t) { t = clamp(t, 0.0, 1.0); return 1.68 * pow(t, 2.6); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 s = lmCentered(uv);
  vec2 pivot = vec2(-ratio * 0.5, -0.5);
  vec2 half_ = vec2(ratio * 0.5, 0.5);
  float a = angleAt(progress);

  // O próximo clipe embaixo: sai da penumbra e recebe a sombra da placa que cai.
  vec3 under = lmToLinear(getToColor(uv).rgb) * mix(0.45, 1.0, smoothstep(0.0, 1.0, progress));
  vec2 sp = pivot + lmRotate(s - pivot - vec2(lmPx(30.0), -lmPx(40.0)), a);
  float shadow = 1.0 - smoothstep(-lmPx(60.0), lmPx(60.0), lmSdBox(sp, half_));
  under *= 1.0 - 0.55 * shadow * (1.0 - smoothstep(0.75, 1.0, progress));

  float aa = max(fwidth(lmSdBox(pivot + lmRotate(s - pivot, a), half_)), 1e-5);
  // Tenda de 3% da transição ≈ obturador de 180° numa transição de 0,8 s a 30 quadros/s: rastro só onde anda
  // rápido, a imagem continua legível.
  const float shutter = 0.03;
  float a0 = angleAt(progress - shutter * 0.5);
  float a1 = angleAt(progress + shutter * 0.5);
  float px = abs(a1 - a0) * length(s - pivot) * resolution.y;
  int n = int(clamp(ceil(px / 2.5), 1.0, 32.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 2.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float ai = mix(a0, a1, tent((float(i) + jitter) / float(n)));
    // Ponto do clipe que está aqui (o clipe girou no sentido horário em volta do canto).
    vec2 q = pivot + lmRotate(s - pivot, ai);
    float cover = clamp(0.5 - lmSdBox(q, half_) / aa, 0.0, 1.0);
    vec3 col = under * (1.0 - cover);
    if (cover > 0.0) col += cover * lmToLinear(getFromColorLod(clamp(lmUncentered(q), 0.0, 1.0), lod).rgb);
    sum += col;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
