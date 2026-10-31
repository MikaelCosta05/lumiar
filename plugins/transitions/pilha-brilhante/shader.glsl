// Pilha brilhante: cópias da imagem cada vez maiores se empilham a partir do centro, macias (lidas no mapa de
// níveis, sem a borda seca das cópias) e mais fracas quanto maiores, com um zoom borrado leve por baixo; as
// altas luzes viram brilho de lente (bloom) e a exposição sobe até um clarão no meio, onde a troca acontece
// escondida. Tudo somado como luz, com as altas luzes comprimidas. "Brilho" = força das cópias e do clarão.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

vec3 layerAt(vec2 uv, float level, float m) {
  vec3 a = m < 1.0 ? lmToLinear(getFromColorLod(uv, level).rgb) : vec3(0.0);
  vec3 b = m > 0.0 ? lmToLinear(getToColorLod(uv, level).rgb) : vec3(0.0);
  return mix(a, b, m);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float s = lmEaseInOutCubic(min(progress, 1.0 - progress) * 2.0);
  vec2 c = vec2(0.5);
  vec2 z = c + (uv - c) / (1.0 + 0.08 * s);
  float m = smoothstep(0.42, 0.58, progress);
  vec4 a = m < 1.0 ? lmZoomBlurFrom(z, c, 0.12 * s, 12) : vec4(0.0);
  vec4 b = m > 0.0 ? lmZoomBlurTo(z, c, 0.12 * s, 12) : vec4(0.0);
  vec3 baseLin = mix(lmToLinear(a.rgb), lmToLinear(b.rgb), m);
  // As cópias: cada uma maior, mais macia e mais fraca; fora da tela, nada (sem borda esticada).
  float level = max(log2(resolution.y / 1080.0 * 6.0), 0.0);
  vec3 stack = vec3(0.0);
  for (int i = 1; i <= 5; i++) {
    float k = float(i);
    vec2 q = c + (uv - c) / (1.0 + k * 0.16 * s);
    vec2 inside = smoothstep(vec2(0.0), vec2(0.02), q) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - q);
    stack += layerAt(q, level * 0.3 + k * 0.5, m) * (0.26 / k) * inside.x * inside.y;
  }
  vec3 bloom = vec3(0.0);
  if (m < 1.0) bloom += lmBloomFrom(z, 0.55, 0.8) * (1.0 - m);
  if (m > 0.0) bloom += lmBloomTo(z, 0.55, 0.8) * m;
  vec3 base = lmToSrgb(baseLin * (1.0 - 0.25 * s));
  vec3 light = (stack * s + baseLin * 0.5 * s * s * s + bloom * 1.8 * s) * glow;
  return vec4(addGlow(base, light), 1.0);
}
