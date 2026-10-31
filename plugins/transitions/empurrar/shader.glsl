// Empurrar: o próximo clipe entra colado ao atual e os dois andam juntos, com aceleração quíntica (sai e chega
// devagar, rápido no meio) e desfoque de movimento proporcional à velocidade (integrado no tempo do obturador).
// Mesma direção de antes: o conteúdo anda para o lado oposto a "direction".

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

float travel(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

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
  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = progress - shutter * 0.5;
  float t1 = progress + shutter * 0.5;
  float px = abs(travel(t1) - travel(t0)) * length(dir * resolution);
  int n = int(clamp(ceil(px / 2.5), 1.0, 40.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 5.0);
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
