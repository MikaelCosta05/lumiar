// Sin City: P&B de quadrinho, duríssimo, e só o vermelho fica (e fica vermelho de verdade).
// - P&B: luminância em luz linear com um leve filtro laranja (pele clara), curva de papel muito dura; antes da
//   curva a imagem é alisada 1,2 px de 1080p para que o ruído do vídeo não vire pontinhos.
// - O vermelho é escolhido em Oklab, por matiz e croma: só vermelhos saturados (batom, vestido, sangue). A pele
//   (matiz mais alaranjado e croma baixo) fica fora, e a máscara é suave nas bordas e some nas sombras fundas,
//   onde o croma é só ruído.
// - O que é vermelho vira um vermelho puro, saturado ao máximo que a tela permite, com a claridade vinda do P&B
//   duro (mantém a forma do objeto).

bool inGamut(vec3 lin) { return all(greaterThanEqual(lin, vec3(-1e-4))) && all(lessThanEqual(lin, vec3(1.0001))); }
/** Oklab → sRGB reduzindo só o croma até caber na tela (claridade e matiz ficam). */
vec3 okToSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  if (inGamut(lmFromOklab(lab))) return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    if (inGamut(lmFromOklab(vec3(lab.x, lab.yz * m)))) lo = m; else hi = m;
  }
  return clamp(lmToSrgb(lmFromOklab(vec3(lab.x, lab.yz * lo))), 0.0, 1.0);
}
vec3 okOf(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 smooth_ = lmGaussianBlur(uv, lmPx(1.2)).rgb;
  vec3 base = mix(c.rgb, smooth_, 0.6);
  vec3 lin = lmToLinear(base);
  float v = lmToSrgb(vec3(dot(lin, vec3(0.36, 0.56, 0.08)))).x;
  float t = paperCurve(v, 11.0, 0.46);
  // Máscara do vermelho (pela cor alisada: sem pontinhos).
  vec3 lab = okOf(smooth_);
  float hue = atan(lab.z, lab.y);
  float chroma = length(lab.yz);
  float red = (1.0 - smoothstep(0.28, 0.52, abs(hue - 0.42))) * smoothstep(0.1, 0.16, chroma) * smoothstep(0.2, 0.35, lab.x);
  vec3 gray = vec3(t);
  float redL = mix(0.36, 0.66, paperCurve(v, 4.0, 0.46));
  vec3 redInk = okToSrgb(vec3(redL, vec2(cos(0.5), sin(0.5)) * 0.3));
  return vec4(mix(gray, redInk, red), c.a);
}
