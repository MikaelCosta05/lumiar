// A mesma conta de src/project/recolor.ts (lá tem os testes): OKLab, a luz do pixel fica, o matiz e a
// saturação vêm da cor escolhida.
float toLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float toGamma(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }

vec3 rgbToOklab(vec3 c) {
  vec3 lin = vec3(toLinear(c.r), toLinear(c.g), toLinear(c.b));
  vec3 lms = vec3(
    dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
    dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
    dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005)));
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(
    dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468)),
    dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766)));
}

/** OKLab → sRGB linear, sem cortar (fora de 0 a 1 = fora da tela). */
vec3 oklabToLinear(vec3 lab) {
  vec3 lms = vec3(
    lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z,
    lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z,
    lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z);
  lms = lms * lms * lms;
  return vec3(
    dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
    dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
    dot(lms, vec3(-0.0041960863, -0.7034186147, 1.707614701)));
}

bool inGamut(vec3 c) { return all(greaterThanEqual(c, vec3(-1e-4))) && all(lessThanEqual(c, vec3(1.0001))); }

vec3 recolor(vec3 pixel, vec3 target) {
  vec3 src = rgbToOklab(pixel);
  vec3 tgt = rgbToOklab(target);
  float L = clamp(src.x + brilho, 0.0, 1.0);
  float want = length(tgt.yz) * max(0.0, saturacao);
  vec2 dir = length(tgt.yz) > 1e-5 ? normalize(tgt.yz) : vec2(1.0, 0.0);
  float chroma = want;
  if (!inGamut(oklabToLinear(vec3(L, dir * chroma)))) {
    // Não cabe na tela com essa luz: a maior saturação que cabe (busca binária).
    float lo = 0.0;
    float hi = want;
    for (int i = 0; i < 8; i++) {
      float mid = (lo + hi) * 0.5;
      if (inGamut(oklabToLinear(vec3(L, dir * mid)))) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  vec3 lin = clamp(oklabToLinear(vec3(L, dir * chroma)), 0.0, 1.0);
  return vec3(toGamma(lin.r), toGamma(lin.g), toGamma(lin.b));
}

float band(float x, float a, float b, float soft) {
  return min(smoothstep(a - soft, a, x), 1.0 - smoothstep(b, b + soft, x));
}

/** Quanto o pixel parece pele (igual a skinLikeness em recolor.ts). */
float skin(vec3 c) {
  vec3 lab = rgbToOklab(c);
  float deg = degrees(atan(lab.z, lab.y));
  return band(deg, 35.0, 80.0, 15.0) * band(length(lab.yz), 0.03, 0.16, 0.03) * band(lab.x, 0.35, 0.92, 0.08);
}

// Onde está o objeto, um pouco maior ou menor (a máscara é pequena e a borda dela é aproximada).
float area(vec2 uv) {
  float m = getPerson(uv);
  float r = abs(margem) * 0.012;
  if (r <= 0.0) return m;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    float n = getPerson(uv + vec2(cos(a) / ratio, sin(a)) * r);
    m = margem > 0.0 ? max(m, n) : min(m, n);
  }
  return m;
}

/**
 * Na borda da máscara, a cor decide: compara o pixel com a cor média de dentro e de fora logo em volta
 * e vê de qual ele está mais perto (o contorno do objeto fica mais fiel que o da máscara pequena).
 */
float refine(vec2 uv, float m, vec3 c) {
  if (m <= 0.01 || m >= 0.99) return m;
  vec3 inside = vec3(0.0);
  vec3 outside = vec3(0.0);
  float wi = 0.0;
  float wo = 0.0;
  for (int ring = 1; ring <= 2; ring++) {
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236 + float(ring) * 0.26;
      vec2 p = uv + vec2(cos(a) / ratio, sin(a)) * 0.007 * float(ring);
      float pm = getPerson(p);
      vec3 pc = getColor(p).rgb;
      inside += pc * pm * pm;
      wi += pm * pm;
      outside += pc * (1.0 - pm) * (1.0 - pm);
      wo += (1.0 - pm) * (1.0 - pm);
    }
  }
  if (wi < 0.5 || wo < 0.5) return m;
  inside /= wi;
  outside /= wo;
  vec3 axis = inside - outside;
  float len2 = dot(axis, axis);
  // Dentro e fora com cores parecidas: a cor não ajuda, vale a máscara.
  if (len2 < 0.004) return m;
  float byColor = clamp(dot(c - outside, axis) / len2, 0.0, 1.0);
  return mix(m, smoothstep(0.2, 0.8, byColor), 0.75);
}

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  float m = area(uv);
  if (m <= 0.0) return original;
  m = refine(uv, m, original.rgb);
  m *= 1.0 - pele * skin(original.rgb);
  if (m <= 0.0) return original;
  return vec4(mix(original.rgb, recolor(original.rgb, cor), m * intensidade), original.a);
}
