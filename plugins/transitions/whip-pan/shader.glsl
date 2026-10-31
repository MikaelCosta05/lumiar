// Chicote (whip pan): os dois clipes ficam lado a lado numa tira que a câmera atravessa com aceleração
// exponencial (quase parada nas pontas, muito rápida no meio). O desfoque de movimento integra a tira durante o
// tempo do obturador: o rastro é proporcional à velocidade em cada instante e a emenda entre os clipes passa
// pela tela no pico, escondida pelo borrão.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

float travel(float t) { return lmEaseInOutExpo(clamp(t, 0.0, 1.0)); }

/** A tira (clipe atual, depois o próximo na direção do movimento), em luz linear. */
vec4 strip(vec2 q, vec2 dir, float lod) {
  vec4 c;
  if (q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0) c = getFromColorLod(q, lod);
  else if (dot(q - 0.5, dir) < 0.0) c = getFromColorLod(mirrorUv(q), lod);
  else c = getToColorLod(mirrorUv(q - dir), lod);
  return vec4(lmToLinear(c.rgb), c.a);
}

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 dir = sign(direction);
  if (dir == vec2(0.0)) dir = vec2(1.0, 0.0);
  // Obturador (em fração da transição): o "Desfoque" abre de quase fechado a ~1 quadro de uma transição curta.
  float shutter = mix(0.004, 0.15, clamp(blur, 0.0, 1.0));
  float t0 = progress - shutter * 0.5;
  float t1 = progress + shutter * 0.5;
  float px = abs(travel(t1) - travel(t0)) * length(dir * resolution);
  int n = int(clamp(ceil(px / 3.5), 1.0, 40.0));
  // Cada amostra lê um nível já filtrado do tamanho do passo entre amostras: rastro liso, sem cópias.
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 6.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    float t = mix(t0, t1, tent((float(i) + jitter) / float(n)));
    sum += strip(uv + travel(t) * dir, dir, lod);
  }
  sum /= float(n);
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
