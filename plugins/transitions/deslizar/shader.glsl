// Deslizar: o próximo clipe entra por cima do atual (que fica parado e escurece), com aceleração quíntica,
// desfoque de movimento só no clipe que anda (a borda dele fica translúcida sobre o de baixo, como numa câmera
// de verdade) e uma sombra suave projetada à frente da borda.

float travel(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

bool inside(vec2 q) { return q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0; }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 d = sign(direction);
  if (d == vec2(0.0)) d = vec2(1.0, 0.0);
  float e = travel(progress);

  // O clipe de baixo: escurece aos poucos e recebe a sombra do que chega.
  vec4 a = getFromColor(uv);
  vec3 under = lmToLinear(a.rgb) * mix(1.0, 0.42, e);
  float shadowAmount = 0.6 * smoothstep(0.0, 0.12, e);

  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = progress - shutter * 0.5;
  float t1 = progress + shutter * 0.5;
  float px = abs(travel(t1) - travel(t0)) * length(d * resolution);
  int n = int(clamp(ceil(px / 2.5), 1.0, 40.0));
  float lod = clamp(log2(max(px / float(n), 1.0)) - 1.0, 0.0, 5.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) {
    if (i >= n) break;
    float t = mix(t0, t1, tent((float(i) + jitter) / float(n)));
    vec2 q = uv + d * (1.0 - travel(t));
    if (inside(q)) {
      vec4 b = getToColorLod(q, lod);
      sum += vec4(lmToLinear(b.rgb), b.a);
    } else {
      // A sombra anda junto com a borda (calculada em cada instante do obturador).
      float sd = lmSdBox(lmCentered(q), vec2(ratio * 0.5, 0.5));
      sum += vec4(under * (1.0 - shadowAmount * exp(-max(sd, 0.0) / lmPx(90.0))), a.a);
    }
  }
  sum /= float(n);
  return vec4(lmToSrgb(sum.rgb), sum.a);
}
