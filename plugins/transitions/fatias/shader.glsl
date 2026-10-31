// Fatias: faixas horizontais empurram o clipe atual para fora em direções alternadas, uma logo depois da outra
// (de baixo para cima), cada uma com aceleração quíntica e desfoque de movimento proporcional à sua velocidade.

float travel(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float n_ = max(floor(count + 0.5), 1.0);
  float idx = min(floor(uv.y * n_), n_ - 1.0);
  float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;
  float start = idx / n_ * 0.3;

  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = (progress - shutter * 0.5 - start) / 0.7;
  float t1 = (progress + shutter * 0.5 - start) / 0.7;
  float px = abs(travel(t1) - travel(t0)) * resolution.x;
  int n = int(clamp(ceil(px / 2.5), 1.0, 32.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 5.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float x = uv.x + dir * travel(mix(t0, t1, tent((float(i) + jitter) / float(n))));
    vec3 c = x >= 0.0 && x <= 1.0 ? getFromColorLod(vec2(x, uv.y), lod).rgb : getToColorLod(vec2(x - dir, uv.y), lod).rgb;
    sum += lmToLinear(c);
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
