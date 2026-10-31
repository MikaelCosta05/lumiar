// Girar: a imagem gira (aceleração quíntica: sai e chega devagar, muito rápida no meio) e se afasta da câmera,
// voltando já no próximo clipe, que termina exatamente na posição normal (o giro do próximo clipe acaba em 0°
// para qualquer número de voltas). O desfoque de movimento integra o giro e o zoom durante o tempo do obturador,
// então o rastro é em arco e proporcional à velocidade em cada ponto; a troca acontece no pico do giro, escondida
// nele. A imagem é um cartão com borda antisserrilhada; em volta dele, o próprio clipe muito desfocado e escuro
// (como um fundo de estúdio), em vez de cópias espelhadas da imagem, que formavam uma estampa de papel de parede.

float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

float spin(float t) { return lmEaseInOutQuint(clamp(t, 0.0, 1.0)); }

/** Afastamento: sobe e desce em seno ao quadrado (parado nas pontas). */
float away(float t) { float s = sin(clamp(t, 0.0, 1.0) * PI); return 1.0 + 1.5 * s * s; }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float turn = 2.0 * PI * turns;
  const float shutter = 0.05;
  float t0 = progress - shutter * 0.5;
  float t1 = progress + shutter * 0.5;
  // Quanto este pixel anda durante o obturador (arco do giro + zoom), em pixels.
  float r = length(p) * away(progress);
  float px = (abs(spin(t1) - spin(t0)) * turn * r + abs(away(t1) - away(t0)) * length(p)) * resolution.y;
  int n = int(clamp(ceil(px / 3.0), 1.0, 24.0));
  float lod = clamp(log2(max(px / float(n) * away(progress), 1.0)) - 1.0, 0.0, 5.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec2 half_ = vec2(ratio * 0.5, 0.5);
  // Fundo: o clipe da vez, muito desfocado (nível 6 do mapa de níveis) e escurecido.
  float mNow = smoothstep(0.47, 0.53, progress);
  vec3 bg = lmToLinear(mix(getFromColorLod(uv, 6.0).rgb, getToColorLod(uv, 6.0).rgb, mNow)) * 0.35;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= n) break;
    float t = mix(t0, t1, tent((float(i) + jitter) / float(n)));
    float e = spin(t);
    float z = away(t);
    float m = smoothstep(0.47, 0.53, t);
    vec3 c = vec3(0.0);
    if (m < 1.0) {
      vec2 q = lmRotate(p, -e * turn) * z;
      float cov = clamp(0.5 - lmSdBox(q, half_) / z * resolution.y, 0.0, 1.0);
      c += mix(bg, lmToLinear(getFromColorLod(clamp(lmUncentered(q), 0.0, 1.0), lod).rgb), cov) * (1.0 - m);
    }
    if (m > 0.0) {
      vec2 q = lmRotate(p, (1.0 - e) * turn) * z;
      float cov = clamp(0.5 - lmSdBox(q, half_) / z * resolution.y, 0.0, 1.0);
      c += mix(bg, lmToLinear(getToColorLod(clamp(lmUncentered(q), 0.0, 1.0), lod).rgb), cov) * m;
    }
    sum += c;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
