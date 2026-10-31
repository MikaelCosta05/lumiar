// Fade por cor: o clipe atual vai até a cor, ela segura alguns quadros e o próximo clipe nasce dela. A mistura é
// feita em Oklab (luminosidade perceptual): o escurecer (ou clarear) anda por igual aos olhos, sem a queda brusca
// no fim que a mistura em luz linear dá e sem o tom acinzentado da mistura direta.
vec3 toLab(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
vec3 fromLab(vec3 lab) { return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec3 c = toLab(tint);
  // Sai de 0 a 0,46, segura a cor até 0,54 e volta até 1.
  if (progress < 0.5) {
    vec4 a = getFromColor(uv);
    float w = lmEaseInOutSine(clamp(progress / 0.46, 0.0, 1.0));
    return vec4(fromLab(mix(toLab(a.rgb), c, w)), a.a);
  }
  vec4 b = getToColor(uv);
  float w = lmEaseInOutSine(clamp((progress - 0.54) / 0.46, 0.0, 1.0));
  return vec4(fromLab(mix(c, toLab(b.rgb), w)), b.a);
}
