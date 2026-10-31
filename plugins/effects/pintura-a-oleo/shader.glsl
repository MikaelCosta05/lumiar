// Pintura a óleo: filtro de Kuwahara anisotrópico (Kyprianidis, Kang e Döllner, 2009) com pesos polinomiais
// (Kyprianidis et al., 2010), mais o relevo da tinta.
// - Tensor de estrutura da imagem (Sobel sobre um nível borrado) dá a direção e o quanto a região é "orientada".
// - A janela do filtro é uma elipse alongada ao longo das bordas: as pinceladas seguem os contornos em vez de virar
//   os quadradinhos do Kuwahara clássico. Oito setores com pesos suaves; vence a média do setor mais liso.
// - Relevo e cor das pinceladas em duas camadas: largas e baixas no fundo liso, finas e com mais tinta onde há
//   forma; cada pincelada com o seu tom e as suas cerdas, iluminadas de cima à esquerda, e a trama da tela por baixo.

const int SAMPLES = 32;
const float GOLDEN = 2.39996323;

vec3 tapLod(vec2 uv, float lod) { return getColorLod(uv, lod).rgb; }

/**
 * Uma camada de pinceladas (uma por célula da grade de lado "cellS", em px de 1080p). "spread" = quanto a direção de
 * cada uma foge da direção do campo; "keep" = fração de células que têm pincelada; "bias" = prioridade da camada
 * (a de prioridade maior fica por cima e decide a cor); "hairAmp" = altura das cerdas. Com "soft", as pinceladas da
 * camada se fundem (vale a mais alta em cada ponto, sem degrau de uma para a outra); sem, a de cima recorta as outras.
 * "won" = 1 quando uma pincelada desta camada ficou por cima.
 */
void strokeLayer(vec2 p, float cellS, float ang, float spread, float seed, float keep, float bias, float hairAmp,
                 bool soft, inout float best, inout float ridge, inout vec3 rs, inout vec2 cs, inout float won) {
  if (keep <= 0.0) return;
  vec2 ci = floor(p / cellS);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ci + vec2(float(i), float(j));
      if (lmHash(c * 1.31 + seed + 5.0) > keep) continue;
      vec3 r = lmHash3(c + seed);
      float prio = lmHash(c + seed + 9.1) + bias;
      if (!soft && prio <= best) continue;
      vec2 centerP = (c + 0.1 + 0.8 * r.xy) * cellS;
      float sa = ang + (r.z - 0.5) * spread;
      vec2 dp = p - centerP;
      vec2 q = vec2(cos(sa) * dp.x + sin(sa) * dp.y, -sin(sa) * dp.x + cos(sa) * dp.y);
      float len = cellS * (0.8 + 0.6 * r.x);
      // O pincel afina no fim do traço (começo largo, ponta mais estreita).
      float wid = cellS * (0.28 + 0.2 * r.y) * (1.0 - 0.35 * smoothstep(-1.0, 1.0, q.x / len));
      float e = (q.x * q.x) / (len * len) + (q.y * q.y) / (wid * wid);
      if (e >= 1.0) continue;
      float dome = sqrt(1.0 - e);
      float hairs = lmNoise(vec2(q.x / (len * 0.8), q.y / (2.0 + 2.2 * r.y)) + r.xy * 40.0);
      float h = dome * 0.7 + hairs * hairAmp * (0.4 + 0.6 * dome);
      if (soft) ridge = max(ridge, h);
      if (prio > best) {
        best = prio;
        rs = r;
        cs = centerP;
        if (!soft) { ridge = h; won = 1.0; }
      }
    }
  }
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  // Raio do pincel em px de 1080p (1 → 4,6 px; 4 → 12,4 px).
  float radiusPx = 2.0 + 2.6 * clamp(radius, 1.0, 4.0);

  // ---- Tensor de estrutura (cor inteira), suavizado: gradientes de uma grade 3×3 em volta, somados com peso
  // gaussiano (sem isso a direção treme de pixel a pixel e a elipse vira um risco em toda parte).
  float h = max(radiusPx * 0.45, 1.5);
  float lodT = max(log2(h * k), 0.0);
  vec2 d = lmPxUv(h);
  vec3 g[25];
  for (int j = 0; j < 5; j++) {
    for (int i = 0; i < 5; i++) g[j * 5 + i] = tapLod(uv + (vec2(float(i), float(j)) - 2.0) * d, lodT);
  }
  float E = 0.0, F = 0.0, G = 0.0;
  for (int j = 1; j <= 3; j++) {
    for (int i = 1; i <= 3; i++) {
      vec3 gx = (g[j * 5 + i + 1] - g[j * 5 + i - 1]) * 0.5;
      vec3 gy = (g[(j + 1) * 5 + i] - g[(j - 1) * 5 + i]) * 0.5;
      float w = (i == 2 ? 2.0 : 1.0) * (j == 2 ? 2.0 : 1.0);
      E += dot(gx, gx) * w;
      F += dot(gx, gy) * w;
      G += dot(gy, gy) * w;
    }
  }
  float root = sqrt((E - G) * (E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + root), l2 = 0.5 * (E + G - root);
  vec2 t = vec2(l1 - E, -F);
  t = dot(t, t) > 1e-12 ? normalize(t) : vec2(0.0, 1.0);
  float aniso = (l1 + l2) > 1e-6 ? (l1 - l2) / (l1 + l2) : 0.0;
  // Onde não há borda de verdade (fundo liso, só degraus de compressão), a pincelada segue um campo largo e suave,
  // como a mão do pintor cobrindo o fundo, em vez de se alinhar com a grade dos blocos do vídeo.
  float strength = smoothstep(2e-4, 2.5e-3, l1);
  float fa = lmNoise(lmCentered(uv) * 3.0 + 3.0) * PI;
  vec2 dbl = mix(vec2(cos(2.0 * fa), sin(2.0 * fa)), vec2(t.x * t.x - t.y * t.y, 2.0 * t.x * t.y), strength);
  float ang = 0.5 * atan(dbl.y, dbl.x);
  vec2 major = vec2(cos(ang), sin(ang));
  aniso = mix(0.6, aniso, strength);
  // Elipse com a = comprido (ao longo da pincelada), b = estreito.
  float a = radiusPx * clamp((1.0 + aniso) / 1.0, 0.1, 2.0);
  float b = radiusPx * clamp(1.0 / (1.0 + aniso), 0.1, 2.0);
  vec2 minor = vec2(-t.y, t.x);

  // ---- Kuwahara anisotrópico, 8 setores com pesos polinomiais.
  const float N = 8.0;
  float zeta = 2.0 / radiusPx;
  float eta = (zeta + cos(PI / N)) / pow(sin(PI / N), 2.0);
  vec4 m[8];
  vec3 s[8];
  for (int i = 0; i < 8; i++) { m[i] = vec4(0.0); s[i] = vec3(0.0); }
  // Amostras espaçadas ~1,6 px: lê um nível que já tem essa média (sem serrilhado).
  float lodS = max(log2(1.2 * k * radiusPx / 6.0), 0.0);
  vec2 toUv = vec2(1.0 / ratio, 1.0) / 1080.0;
  for (int i = 0; i < SAMPLES; i++) {
    float r = sqrt((float(i) + 0.5) / float(SAMPLES));
    float ang = float(i) * GOLDEN;
    vec2 v = r * vec2(cos(ang), sin(ang));          // no disco unitário da elipse
    vec2 off = (major * v.x * a + minor * v.y * b) * toUv;
    vec3 c = tapLod(uv + off, lodS);
    vec3 c2 = c * c;
    float w[8];
    float sum = 0.0;
    float vxx = zeta - eta * v.x * v.x;
    float vyy = zeta - eta * v.y * v.y;
    float z;
    z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
    z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
    z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
    z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
    vec2 u = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
    vxx = zeta - eta * u.x * u.x;
    vyy = zeta - eta * u.y * u.y;
    z = max(0.0, u.y + vxx); w[1] = z * z; sum += w[1];
    z = max(0.0, -u.x + vyy); w[3] = z * z; sum += w[3];
    z = max(0.0, -u.y + vxx); w[5] = z * z; sum += w[5];
    z = max(0.0, u.x + vyy); w[7] = z * z; sum += w[7];
    float g = exp(-2.0 * dot(v, v)) / max(sum, 1e-6);
    for (int q = 0; q < 8; q++) {
      float wk = w[q] * g;
      m[q] += vec4(c * wk, wk);
      s[q] += c2 * wk;
    }
  }
  vec4 o = vec4(0.0);
  for (int q = 0; q < 8; q++) {
    vec3 mean = m[q].rgb / max(m[q].w, 1e-6);
    vec3 var = abs(s[q] / max(m[q].w, 1e-6) - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float w = 1.0 / (1.0 + pow(255.0 * sigma2, 4.0));
    o += vec4(mean * w, w);
  }
  vec3 col = o.rgb / max(o.w, 1e-6);

  // ---- Relevo e cor das pinceladas. Duas camadas de pinceladas soltas (uma por célula, deslocadas ao acaso, com
  // comprimento, largura, inclinação e cerdas próprios): por baixo, pinceladas largas e compridas, de relevo baixo e
  // direções variadas (o pintor cobrindo o fundo); por cima, só onde a imagem tem forma (bordas, detalhe), pinceladas
  // finas que seguem o contorno, com mais tinta. Assim o fundo liso fica quase liso, e não uma estampa repetida.
  vec2 p = lmCentered(uv) * 1080.0;
  float detail = strength;
  float ridge = 0.0;
  float best = -1.0;
  vec3 rs = vec3(0.5);
  vec2 cs = p;
  float fine = 0.0;
  strokeLayer(p, radiusPx * 8.0, ang, 1.5, 0.37, 1.0, 0.0, 0.10, true, best, ridge, rs, cs, fine);
  strokeLayer(p, radiusPx * 2.3, ang, 0.45, 5.91, detail * 1.25 - 0.1, 1.0, 0.24, false, best, ridge, rs, cs, fine);
  // Cada pincelada leva a sua tinta: no liso, a cor puxa para a do meio da pincelada (manchas que seguem o traço, como
  // a tinta arrastada) e cada uma tem um tom um pouco diferente.
  float flat_ = (1.0 - detail) * (1.0 - detail);
  vec3 strokeCol = tapLod(lmUncentered(cs / 1080.0), lodS + 1.0);
  // Só puxa quando a cor do meio do traço é parecida (a pincelada não atravessa a borda de um objeto).
  vec3 dc = strokeCol - col;
  float similar = exp(-dot(dc, dc) / 0.004);
  col = mix(col, strokeCol, 0.55 * flat_ * similar);
  col *= 1.0 + ((rs.x - 0.5) * 0.03 + (rs.y - 0.5) * vec3(0.006, 0.0, -0.006)) * mix(1.0, 0.6, detail);
  vec2 slope = vec2(dFdx(ridge), dFdy(ridge)) / max(k, 1e-3);
  // Degraus de altura entre pinceladas viram uma aresta de luz, sem estourar em pontinhos.
  slope *= 1.0 / (1.0 + length(slope) * 6.0);
  // Pouca tinta nas pinceladas largas do fundo; as finas, por cima da forma, têm o relevo inteiro.
  float light = dot(slope, normalize(vec2(-0.6, 0.8))) * mix(0.3, 1.0, fine);
  col *= 1.0 + light * 0.6;
  // Brilho da tinta fresca no alto das cristas (aparece também na tinta escura).
  col += max(light, 0.0) * mix(0.02, 0.06, fine);
  // Trama da tela, bem de leve.
  float weave = sin(p.x * 1.35) * sin(p.y * 1.35);
  col *= 1.0 + weave * 0.012;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
