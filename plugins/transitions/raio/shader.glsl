// Raio: o céu escurece como antes de uma tempestade e três descargas cortam a tela (uma fraca, a principal no
// meio, onde a troca acontece escondida pelo clarão, e um repique). Cada descarga tem forma própria (ruído de
// gradiente em oitavas ao longo da altura, com um galho), núcleo fino quase branco e brilho em duas larguras
// medidas em pixels de 1080p; a distância é a perpendicular ao traço (a espessura não muda com a inclinação). O
// clarão ilumina a cena em luz linear, com as altas luzes comprimidas.

/** x do raio (em uv) na altura y, para a descarga "seed", com "octaves" oitavas de zigue-zague. */
float boltX(float y, float seed, int octaves) {
  float x = 0.5 + (lmHash(seed * 7.13 + 1.0) - 0.5) * 0.3;
  float amp = 0.09;
  float freq = 2.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    x += lmNoise(vec2(y * freq, seed * 13.7 + float(i) * 3.1)) * amp;
    amp *= 0.55;
    freq *= 2.1;
  }
  return x;
}

/** Distância (altura da tela) do pixel ao traço x(y), corrigida pela inclinação. */
float boltDistance(vec2 uv, float seed, int octaves) {
  float x = boltX(uv.y, seed, octaves);
  float slope = (boltX(uv.y + 0.002, seed, octaves) - boltX(uv.y - 0.002, seed, octaves)) / 0.004 * ratio;
  return abs(uv.x - x) * ratio / sqrt(1.0 + slope * slope);
}

/** Brilho de uma descarga no pixel: tronco + um galho que sai dele e some. */
float bolt(vec2 uv, float seed) {
  float main = boltDistance(uv, seed, 5);
  // O brilho largo segue o traço sem o zigue-zague fino (senão cada linha da tela teria um brilho diferente).
  float smooth_ = boltDistance(uv, seed, 2);
  // Galho: parte do tronco numa altura própria e desce inclinado, afinando até sumir.
  float y0 = 0.45 + lmHash(seed * 3.7 + 5.0) * 0.3;
  float side = lmHash(seed * 9.1 + 2.0) < 0.5 ? -1.0 : 1.0;
  float along = clamp((y0 - uv.y) / 0.35, 0.0, 1.0);
  float bx = boltX(y0, seed, 5) + side * (y0 - uv.y) * 0.45 + lmNoise(vec2(uv.y * 9.0, seed + 40.0)) * 0.03 * along;
  float branch = abs(uv.x - bx) * ratio * 1.15 + step(uv.y, y0 - 0.35) + step(y0, uv.y);
  float branchFade = (1.0 - along) * step(uv.y, y0);
  float core = exp(-pow(main / lmPx(1.8), 2.0)) + exp(-pow(branch / lmPx(1.2), 2.0)) * branchFade;
  float glow = exp(-main / lmPx(18.0)) * 0.55 + exp(-smooth_ / lmPx(140.0)) * 0.22 + exp(-branch / lmPx(14.0)) * 0.3 * branchFade;
  return core * 2.5 + glow;
}

/** Envelope de uma descarga: acende quase na hora e apaga em poucos quadros. */
float strike(float t, float at) {
  float x = t - at;
  return x < 0.0 ? exp(-pow(x / 0.006, 2.0)) : exp(-x / 0.03);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float s1 = strike(progress, 0.38) * 0.45;
  float s2 = strike(progress, 0.5);
  float s3 = strike(progress, 0.6) * 0.6;
  // A tempestade: escurece e esfria até o meio, volta no próximo clipe.
  float storm = smoothstep(0.05, 0.36, progress) * (1.0 - smoothstep(0.62, 0.96, progress));
  // Corte seco no pico do clarão principal.
  float m = step(0.5, progress);
  vec3 img = mix(lmToLinear(getFromColor(uv).rgb), lmToLinear(getToColor(uv).rgb), m);
  img *= mix(vec3(1.0), vec3(0.32, 0.36, 0.45), storm);
  vec3 tintLin = lmToLinear(tint);
  float sky = s1 + s2 + s3;
  // O clarão ilumina a cena (mais forte no alto, de onde vem a luz).
  vec3 lin = img * (1.0 + 7.0 * sky * (0.6 + 0.4 * uv.y)) + tintLin * sky * 0.5;
  float b = 0.0;
  if (s1 > 0.01) b += bolt(uv, 1.0) * s1;
  if (s2 > 0.01) b += bolt(uv, 2.0) * s2;
  if (s3 > 0.01) b += bolt(uv, 3.0) * s3;
  lin += mix(tintLin, vec3(1.0), clamp(b * 0.3, 0.0, 0.8)) * b;
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.7), clamp((sky + b) * 4.0, 0.0, 1.0));
  return vec4(col, 1.0);
}
