// Mutação cromática: os canais de cor se separam em três direções (a 120°, que giram devagar), cada um com um
// rastro contínuo (não três cópias secas), com aceleração na ida e na volta; a troca acontece no auge da
// separação, em luz linear, e os canais se juntam já no próximo clipe. Bordas espelhadas.

vec2 mirrorUv(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec3 splitFrom(vec2 uv, vec2 oR, vec2 oG, vec2 oB, float jitter) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float k = 0.45 + 0.55 * (float(i) + jitter) / 8.0;
    sum.r += lmToLinear(getFromColor(mirrorUv(uv + oR * k)).rgb).r;
    sum.g += lmToLinear(getFromColor(mirrorUv(uv + oG * k)).rgb).g;
    sum.b += lmToLinear(getFromColor(mirrorUv(uv + oB * k)).rgb).b;
  }
  return sum / 8.0;
}

vec3 splitTo(vec2 uv, vec2 oR, vec2 oG, vec2 oB, float jitter) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float k = 0.45 + 0.55 * (float(i) + jitter) / 8.0;
    sum.r += lmToLinear(getToColor(mirrorUv(uv - oR * k)).rgb).r;
    sum.g += lmToLinear(getToColor(mirrorUv(uv - oG * k)).rgb).g;
    sum.b += lmToLinear(getToColor(mirrorUv(uv - oB * k)).rgb).b;
  }
  return sum / 8.0;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float s = lmEaseInOutCubic(min(progress, 1.0 - progress) * 2.0);
  float r = 0.12 * s * strength;  // em altura de tela
  float phi = lmEaseInOutSine(progress) * 0.9;
  vec2 aspect = vec2(1.0 / ratio, 1.0);
  vec2 oR = vec2(cos(phi), sin(phi)) * r * aspect;
  vec2 oG = vec2(cos(phi + 2.0944), sin(phi + 2.0944)) * r * aspect;
  vec2 oB = vec2(cos(phi + 4.1888), sin(phi + 4.1888)) * r * aspect;
  float jitter = lmIGN(gl_FragCoord.xy);
  float m = smoothstep(0.4, 0.6, progress);
  vec3 a = m < 1.0 ? splitFrom(uv, oR, oG, oB, jitter) : vec3(0.0);
  vec3 b = m > 0.0 ? splitTo(uv, oR, oG, oB, jitter) : vec3(0.0);
  return vec4(lmToSrgb(mix(a, b, m)), 1.0);
}
