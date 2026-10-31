// Morph: as imagens se deformam uma na outra pelas cores (a ideia do "morph" do gl-transitions, MIT), mas o
// campo de deformação vem das cores já suavizadas (mapa de níveis), então a imagem escorre em formas largas em
// vez de se esfarelar pixel a pixel; o movimento tem aceleração, a mistura é em luz linear e as bordas são
// espelhadas em vez de esticadas.

vec2 mirrorUv(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  // Cores médias numa área de ~24 px de 1080p.
  float level = max(log2(resolution.y / 1080.0 * 24.0), 0.0);
  vec3 ca = getFromColorLod(uv, level).rgb;
  vec3 cb = getToColorLod(uv, level).rgb;
  vec2 oa = vec2(ca.r + ca.b, ca.g + ca.b) - 1.0;
  vec2 ob = vec2(cb.r + cb.b, cb.g + cb.b) - 1.0;
  vec2 oc = (oa + ob) * 0.5 * strength;
  float e = lmEaseInOutSine(progress);
  vec3 a = lmToLinear(getFromColor(mirrorUv(uv + oc * e)).rgb);
  vec3 b = lmToLinear(getToColor(mirrorUv(uv - oc * (1.0 - e))).rgb);
  return vec4(lmToSrgb(mix(a, b, e)), 1.0);
}
