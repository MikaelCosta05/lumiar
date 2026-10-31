// Dissolver: mistura em luz linear (como dois projetores somando luz), que não escurece nem afunda as cores no
// meio como a mistura direta em sRGB. A curva é quase linear, só arredondada nas pontas (sem tranco no início e
// no fim).
vec4 transition(vec2 uv) {
  vec4 a = getFromColor(uv);
  vec4 b = getToColor(uv);
  float w = mix(progress, lmEaseInOutSine(progress), 0.5);
  return vec4(lmToSrgb(mix(lmToLinear(a.rgb), lmToLinear(b.rgb), w)), mix(a.a, b.a, w));
}
