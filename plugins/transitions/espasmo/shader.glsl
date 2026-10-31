// Espasmo: a câmera dá saltos de zoom e posição em 24 passos, piscando entre os clipes, mais forte no meio.
// Cada salto é um estalo (sai rápido e assenta com curva exponencial, não um quadro parado) com desfoque radial
// proporcional à velocidade do estalo, e alguns passos ganham um lampejo de superexposição. O acaso é por passo
// (o mesmo progresso dá sempre o mesmo quadro) e o deslocamento nunca passa da folga do zoom (a borda não aparece).

/** Zoom e deslocamento (uv) do alvo do passo "t". */
vec3 target(float t) {
  float env = sin(clamp(t / 23.0, 0.0, 1.0) * PI);
  env *= env;
  float z = 1.0 + lmHash(vec2(t, 3.0)) * 0.5 * env;
  float room = (1.0 - 1.0 / z) * 0.5 * 0.9;
  vec2 off = (lmHash2(vec2(t, 5.0)) * 2.0 - 1.0) * room;
  return vec3(off, z);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float steps = progress * 24.0;
  float t = floor(steps);
  float f = steps - t;
  float k = lmEaseOutExpo(min(f / 0.4, 1.0));
  vec3 a = target(t - 1.0);
  vec3 b = target(t);
  vec3 cur = mix(a, b, k);
  vec2 center = vec2(0.5) + cur.xy;
  vec2 q = (uv - 0.5) / cur.z + center;
  // Velocidade do estalo: quanto a escala muda em ~1/2 quadro.
  float dk = lmEaseOutExpo(min((f + 0.15) / 0.4, 1.0)) - k;
  float amount = abs(log(b.z) - log(a.z)) * dk + length(b.xy - a.xy) * dk * 2.0;
  int n = int(clamp(ceil(amount * length(resolution) * 0.5 / 2.5), 1.0, 24.0));

  float env = sin(progress * PI);
  bool next = progress > 0.5;
  if (env > 0.5 && lmHash(vec2(t, 9.0)) > 0.7) next = !next;
  vec4 col = next ? lmZoomBlurTo(q, center, amount, n) : lmZoomBlurFrom(q, center, amount, n);
  // Lampejo: superexposição que se apaga dentro do passo.
  float flash = step(0.88, lmHash(vec2(t, 11.0))) * step(0.45, env) * (1.0 - f);
  vec3 lin = lmToLinear(col.rgb) * (1.0 + 1.6 * flash) + 0.04 * flash;
  vec3 c = lmToSrgb(lin);
  c = mix(c, lmSoftClip(c, 0.75), clamp(flash * 3.0, 0.0, 1.0));
  return vec4(c, col.a);
}
