// Loop cromático: as cores giram pelo arco-íris durante a troca e voltam ao normal no fim. O giro de matiz é feito
// em Oklab (o brilho percebido de cada cor não muda: o rosto não "acende" nem "apaga" ao passar pelo verde ou pelo
// azul), com a cor um pouco mais viva no meio. O giro sobe e desce em curva suave (seno ao quadrado) e a troca de
// clipe é uma mistura em luz linear.

vec3 shiftHue(vec3 lin, float angle, float chroma) {
  vec3 lab = lmToOklab(lin);
  float s = sin(angle), c = cos(angle);
  lab.yz = mat2(c, s, -s, c) * lab.yz * chroma;
  return max(lmFromOklab(lab), 0.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float bell = sin(progress * PI);
  bell *= bell;
  float angle = bell * cycles * 2.0 * PI;
  float chroma = 1.0 + 0.5 * bell;
  float m = smoothstep(0.3, 0.7, progress);
  vec3 lin = mix(lmToLinear(getFromColor(uv).rgb), lmToLinear(getToColor(uv).rgb), m);
  return vec4(clamp(lmToSrgb(shiftHue(lin, angle, chroma)), 0.0, 1.0), 1.0);
}
