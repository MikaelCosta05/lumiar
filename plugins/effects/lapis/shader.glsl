// Desenho a lápis: contorno de grafite + hachuras que acompanham a forma, sobre papel com dente.
// - Contorno: Diferença de Gaussianas (σ 1,4 e 2,2 px de 1080p) num laço 7×7 sem acaso: linhas limpas, sem chuvisco.
// - Hachuras: a direção segue as isofotas (perpendicular ao gradiente de luz de uma versão bem borrada da imagem),
//   então os traços contornam o volume; onde não há forma, voltam para a diagonal da mão do desenhista.
//   O papel é dividido em retalhos de 48 px misturados suavemente; em cada um os traços têm comprimento, pressão,
//   pontas afinadas e pequenas falhas próprios. Quanto mais escuro o tom, mais camadas cruzadas.
// - O grafite só pega nos picos do dente do papel.

const float PATCH = 48.0;

vec2 rot(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }

/** Uma camada de traços paralelos ao eixo x (coordenadas em px de 1080p). */
float strokes(vec2 u, float spacing, float seed, float aa) {
  float y = u.y / spacing;
  float n = floor(y);
  float dist = abs(fract(y) - 0.5) * spacing;
  float h = lmHash(vec2(n, seed));
  float len = 26.0 + 38.0 * h;
  float sx = (u.x + h * 97.0) / len;
  float seg = floor(sx);
  float t = fract(sx);
  float gap = step(0.14, lmHash(vec2(n * 1.31 + seed, seg)));
  float taper = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.8, t);
  float pressure = 0.55 + 0.45 * lmHash(vec2(seg + 3.7 * seed, n));
  float width = (0.45 + 0.35 * h) * mix(0.6, 1.0, taper);
  return (1.0 - smoothstep(width - aa, width + aa, dist)) * pressure * gap * taper;
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  float aa = 0.75 / k;  // um pixel da tela, em px de 1080p

  // Luminância suavizada (contorno e tom).
  vec2 px = lmPxUv(1.4);
  float g1 = 0.0, w1 = 0.0, g2 = 0.0, w2 = 0.0;
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec2 o = vec2(float(i), float(j));
      float l = lmLuma(getColor(uv + o * px).rgb);
      float r2 = dot(o, o);
      float k1 = exp(-r2 / 2.0);
      float k2 = exp(-r2 / 5.12);
      g1 += l * k1; w1 += k1;
      g2 += l * k2; w2 += k2;
    }
  }
  g1 /= w1;
  g2 /= w2;
  float dog = (g2 - g1) / (g2 + 0.1);
  float outline = smoothstep(0.006, 0.045, dog) * clamp(strength * 0.5, 0.25, 1.6);

  // Tom do grafite (o desenhista simplifica: tom de uma imagem um pouco borrada).
  float lodTone = max(log2(4.0 * k), 0.0);
  float l = lmLuma(getColorLod(uv, lodTone).rgb);
  float tone = 1.0 - smoothstep(0.03, 0.88, l);

  // Direção das hachuras: ao longo das isofotas de uma versão bem borrada (ângulo dobrado, sem o salto de 180°).
  float lodDir = max(log2(24.0 * k), 0.0);
  vec2 o = lmPxUv(16.0);
  float gx = lmLuma(getColorLod(uv + vec2(o.x, 0.0), lodDir).rgb) - lmLuma(getColorLod(uv - vec2(o.x, 0.0), lodDir).rgb);
  float gy = lmLuma(getColorLod(uv + vec2(0.0, o.y), lodDir).rgb) - lmLuma(getColorLod(uv - vec2(0.0, o.y), lodDir).rgb);
  vec2 g = vec2(gx, gy);
  float g2len = dot(g, g);
  vec2 dbl = g2len > 1e-8 ? vec2(g.x * g.x - g.y * g.y, 2.0 * g.x * g.y) / g2len : vec2(0.0);
  float follow = smoothstep(0.0002, 0.004, g2len) * 0.8;
  float handAngle = radians(58.0);            // traço da mão: diagonal subindo para a direita
  vec2 handDbl = -vec2(cos(2.0 * handAngle), sin(2.0 * handAngle));
  vec2 v = dbl * follow + handDbl * (1.0 - follow);
  float angle = 0.5 * atan(v.y, v.x) + 0.5 * PI;

  // Retalhos de hachura misturados suavemente.
  vec2 p = lmCentered(uv) * 1080.0;
  vec2 s = p / PATCH - 0.5;
  vec2 cell = floor(s);
  vec2 f = smoothstep(0.0, 1.0, fract(s));
  float a1 = smoothstep(0.06, 0.34, tone) * hatching;
  float a2 = smoothstep(0.34, 0.64, tone) * hatching;
  float a3 = smoothstep(0.6, 0.9, tone) * hatching;
  float hatch = 0.0;
  float wsum = 0.0;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec3 r = lmHash3(c + 0.5);
      vec2 q = p - (c + 0.5) * PATCH + (r.xy - 0.5) * 40.0;
      float ang = angle + (r.z - 0.5) * 0.3;
      float seed = r.x * 61.0;
      float d1 = strokes(rot(q, ang), 4.2, seed, aa) * a1;
      float d2 = strokes(rot(q, ang + 0.95), 4.0, seed + 13.0, aa) * a2;
      float d3 = strokes(rot(q, ang - 0.6), 3.2, seed + 29.0, aa) * a3;
      float dark = 1.0 - (1.0 - d1) * (1.0 - d2) * (1.0 - d3);
      float w = mix(1.0 - f.x, f.x, float(i)) * mix(1.0 - f.y, f.y, float(j));
      w = w * w * w;
      hatch += dark * w;
      wsum += w;
    }
  }
  hatch /= max(wsum, 1e-5);

  // Dente do papel: o grafite marca os picos e pula os vales.
  float tooth = lmNoise(p / 2.2) * 0.6 + lmNoise(p / 6.0 + 7.0) * 0.4;
  float catchG = smoothstep(-0.55, 0.45, tooth);
  float smudge = tone * 0.24;

  float dark = 1.0 - (1.0 - smudge) * (1.0 - hatch * 0.85 * mix(0.45, 1.0, catchG)) * (1.0 - clamp(outline, 0.0, 1.0) * 0.88 * mix(0.7, 1.0, catchG));
  vec3 paper = vec3(0.96, 0.95, 0.91) * (1.0 + tooth * 0.025);
  vec3 graphite = vec3(0.16, 0.16, 0.18);
  return vec4(mix(paper, graphite, clamp(dark, 0.0, 1.0)), 1.0);
}
