// Tremor de câmera na mão: deslocamento e giro vindos de ruído suave em 3 oitavas (balanço lento + tremida fina,
// como a mão de verdade), nunca saltos de acaso. A imagem é aproximada só o necessário para o deslocamento e o giro
// não mostrarem a borda (e, por garantia, o que passar dela é espelhado, não esticado). O desfoque de movimento
// segue a velocidade da câmera em cada ponto (obturador de 180° a 30 fps), então os trancos rápidos borram.

float shake(float t, float seed) {
  return lmNoise(vec2(t, seed)) * 0.62 + lmNoise(vec2(t * 2.17, seed + 7.3)) * 0.27 + lmNoise(vec2(t * 4.9, seed + 13.1)) * 0.11;
}

/** De onde vem a imagem que aparece em "uv" no instante t. */
vec2 sourceAt(vec2 uv, float t, float zoom) {
  float T = t * speed * 0.55;
  vec2 offset = vec2(shake(T, 1.7), shake(T, 21.3)) * 0.03 * intensity;
  float angle = shake(T, 41.7) * 0.06 * intensity * rotation;
  vec2 p = lmRotate(lmCentered(uv), angle) / zoom + offset;
  return lmUncentered(p);
}

vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }

vec4 effect(vec2 uv) {
  // Aproximação mínima que esconde a borda: deslocamento máximo dos dois lados + o canto que gira.
  float zoom = 1.0 + intensity * (0.062 + 0.06 * rotation * max(ratio, 1.0 / ratio) * 0.85);
  vec2 now = sourceAt(uv, time, zoom);
  // Rastro do obturador: de 1/120 s antes a 1/120 s depois.
  vec2 a = sourceAt(uv, time - 1.0 / 120.0, zoom);
  vec2 b = sourceAt(uv, time + 1.0 / 120.0, zoom);
  vec2 trail = b - a;
  float lenPx = length(trail * vec2(ratio, 1.0)) * resolution.y;
  if (lenPx < 0.75) return getColor(mirrorUv(now));
  int n = int(clamp(ceil(lenPx / 1.5), 2.0, 16.0));
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    float k = (float(i) + jitter) / float(n) - 0.5;
    vec4 s = getColor(mirrorUv(now + trail * k));
    s.rgb = lmToLinear(s.rgb);
    sum += s;
  }
  sum /= float(n);
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
