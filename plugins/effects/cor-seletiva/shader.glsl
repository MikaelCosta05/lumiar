// Cor seletiva: o que tem o matiz escolhido (tolerância em matiz, como no Matiz/Saturação dos editores) continua
// colorido; o resto vira cinza com a mesma claridade percebida (Oklab L), então o preto e branco não fica com o céu
// escuro nem a pele lavada. Cores quase cinzas ou quase pretas não são mantidas (sem manchas de cor no ruído).

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 hsv = lmRgbToHsv(c.rgb);
  float target = lmRgbToHsv(keep).x;
  float dh = abs(fract(hsv.x - target + 0.5) - 0.5);
  float m = (1.0 - smoothstep(range, range + 0.05, dh)) * smoothstep(0.1, 0.25, hsv.y) * smoothstep(0.03, 0.12, hsv.z);
  vec3 lab = lmToOklab(lmToLinear(c.rgb));
  vec3 gray = clamp(lmToSrgb(lmFromOklab(vec3(lab.x, 0.0, 0.0))), 0.0, 1.0);
  return vec4(mix(gray, c.rgb, m), c.a);
}
