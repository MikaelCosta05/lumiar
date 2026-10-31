// Impressão em tipografia/gravura: tinta preta forte prensada no papel.
// - A tinta segue uma curva muito dura sobre a luminância (alisada 1 px de 1080p para que o ruído do vídeo não
//   vire pontos), com a borda levemente irregular por ruído (a tinta espalha nas fibras): sem serrilhado.
// - Densidade irregular da prensa (manchas largas onde entrou menos tinta) e o papel que "fura" a tinta nas
//   áreas cheias (pontinhos claros onde a fibra não pegou), tudo fixo como no papel.
// - Papel com fibras e tinta preto-azulada, misturados como tinta sobre papel (multiplicando).

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

/** Imagem borrada (raio ~"px" de 1080p) pelos níveis de detalhe, com filtro em tenda (sem blocos). */
vec3 wideBlur(vec2 uv, float px) {
  float level = log2(max(px * resolution.y / 1080.0, 1.0)) - 1.0;
  vec2 texel = exp2(level) / resolution;
  vec3 s = getColorLod(uv, level).rgb * 4.0;
  s += (getColorLod(uv + vec2(texel.x, 0.0), level).rgb + getColorLod(uv - vec2(texel.x, 0.0), level).rgb
    + getColorLod(uv + vec2(0.0, texel.y), level).rgb + getColorLod(uv - vec2(0.0, texel.y), level).rgb) * 2.0;
  s += getColorLod(uv + texel, level).rgb + getColorLod(uv - texel, level).rgb
    + getColorLod(uv + vec2(texel.x, -texel.y), level).rgb + getColorLod(uv + vec2(-texel.x, texel.y), level).rgb;
  return s / 16.0;
}

float lum(vec3 c) { return lmToSrgb(vec3(lmLuma(lmToLinear(c)))).x; }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 px = lmCentered(uv) * 1080.0;
  float v = mix(lum(c.rgb), lum(wideBlur(uv, 2.0)), 0.7);
  // A tinta espalha nas fibras: o limite varia com um ruído fino.
  float spread = lmFbm(px * 0.18 + 4.1, 2) * 0.055;
  float ink = 1.0 - paperCurve(clamp(v + spread, 0.0, 1.0), 10.0, 0.48);
  // Densidade da prensa e fibras que não pegam tinta.
  float press = 0.88 + 0.12 * (lmFbm(px * 0.006 + 1.3, 2) * 0.5 + 0.5);
  float tooth = lmFbm(px * 0.55 + 8.2, 2);
  float holes = smoothstep(0.35, 0.75, tooth) * 0.35;
  ink *= press * (1.0 - holes * smoothstep(0.6, 1.0, ink));
  float fibers = lmFbm(px * vec2(0.025, 0.09) + 11.0, 2);
  vec3 paperColor = vec3(0.97, 0.955, 0.915) * (1.0 + fibers * 0.03);
  vec3 inkColor = vec3(0.065, 0.065, 0.08);
  vec3 col = paperColor * mix(vec3(1.0), inkColor / vec3(0.97, 0.955, 0.915), clamp(ink, 0.0, 1.0));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
