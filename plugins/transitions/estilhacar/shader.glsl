// Estilhaçar: o clipe trinca como vidro a partir de um ponto de impacto (as trincas correm do impacto para
// fora), cada caco se desloca um pouco e refrata a imagem, e depois os cacos caem com gravidade, girando em 3D
// num eixo próprio e vindo um pouco na direção da câmera (perspectiva de verdade: cada pixel acha o caco que o
// cobre pelo raio da câmera). Os cacos têm borda de vidro brilhante, luz que muda com o ângulo, reflexo
// especular quando viram para a luz e verso mais escuro; o próximo clipe aparece atrás, na sombra deles.
// "Cacos" = quantos cacos cabem na altura da tela.

const float CAM = 2.4;               // distância da câmera à tela (em alturas de tela)
const vec2 IMPACT = vec2(0.08, 0.06); // ponto do impacto (centro da tela = 0)

// Os cacos são células de Voronoi num espaço polar em volta do impacto (ângulo × logaritmo do raio): saem
// lascas compridas que apontam para o impacto, pequenas perto dele e maiores longe, como vidro de verdade.
float angularCells() { return max(floor(pieces * 2.2 + 0.5), 6.0); }
float radialScale() { return angularCells() / (4.0 * PI); }

vec2 toShardSpace(vec2 p) {
  vec2 d = p - IMPACT;
  return vec2((atan(d.y, d.x) / (2.0 * PI) + 0.5) * angularCells(), radialScale() * log(length(d) + 0.02));
}
vec2 fromShardSpace(vec2 g) {
  float a = (g.x / angularCells() - 0.5) * 2.0 * PI;
  float r = exp(g.y / radialScale()) - 0.02;
  return IMPACT + vec2(cos(a), sin(a)) * max(r, 0.0);
}
/** Identidade da célula, com o ângulo dando a volta (a célula −1 é a mesma que a N − 1). */
vec2 cellId(vec2 cell) { return vec2(mod(cell.x, angularCells()), cell.y); }
vec2 siteOf(vec2 cell) { return cell + 0.15 + 0.7 * lmHash2(cellId(cell) + 0.13); }

/** Célula do caco que contém o ponto g (no espaço dos cacos). */
vec2 nearestCell(vec2 g) {
  vec2 b = floor(g);
  float best = 1e9;
  vec2 found = b;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = b + vec2(float(i), float(j));
      vec2 d = siteOf(c) - g;
      float dd = dot(d, d);
      if (dd < best) { best = dd; found = c; }
    }
  }
  return found;
}

/** Distância (no espaço dos cacos) do ponto g até a borda do caco "cell" (Inigo Quilez). */
float borderDist(vec2 g, vec2 cell) {
  vec2 s0 = siteOf(cell);
  vec2 b = floor(g);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      if (c == cell) continue;
      vec2 s1 = siteOf(c);
      md = min(md, dot(0.5 * (s0 + s1) - g, normalize(s1 - s0)));
    }
  }
  return md;
}

/** Tempo próprio do caco (0 = parado, 1 = já saiu), só pelo raio do centro dele (barato, sem trigonometria). */
float pieceTime(vec2 cell, vec2 site) {
  float r = exp(site.y / radialScale()) - 0.02;
  float far = 0.5 * length(vec2(ratio, 1.0)) + length(IMPACT);
  float delay = 0.38 * clamp(r / far, 0.0, 1.0) + 0.07 * lmHash(cellId(cell) + 4.1);
  return clamp((progress - 0.12 - delay) / 0.43, 0.0, 1.0);
}

/** Movimento do caco: deslocamento (T) e o centro na tela, dado o tempo próprio dele. */
void pieceMoveSite(vec2 cell, vec2 site, float tau, out vec3 T, out vec2 c) {
  c = fromShardSpace(site);
  vec3 h = lmHash3(cellId(cell) + 9.7);
  vec2 away = normalize(c - IMPACT + 1e-4) * (0.12 + 0.2 * h.x) * tau;
  T = vec3(away.x, away.y - 2.3 * tau * tau, -min(0.8 * tau * (0.4 + h.y), 1.0));
}

/** Giro do caco (eixo próprio, ângulo que cresce com o tempo dele). */
mat3 pieceTurn(vec2 cell, float tau) {
  vec2 id = cellId(cell);
  vec3 h = lmHash3(id + 9.7);
  float angle = tau * (2.0 + 4.0 * h.z) * (h.x > 0.5 ? 1.0 : -1.0);
  vec3 k = normalize(lmHash3(id + 2.3) * 2.0 - 1.0 + 1e-3);
  float s = sin(angle), co = cos(angle);
  mat3 K = mat3(0.0, k.z, -k.y, -k.z, 0.0, k.x, k.y, -k.x, 0.0);
  return mat3(1.0) + s * K + (1.0 - co) * K * K;
}

struct Hit { float t; vec2 cell; vec2 q; vec3 N; float tau; bool front; };

/** Testa um caco: se o raio da câmera por este pixel acerta o caco, guarda o mais perto da câmera. */
void testCell(vec2 cell, vec2 p, inout Hit hit) {
  vec2 site = siteOf(cell);
  float tau = pieceTime(cell, site);
  if (tau >= 1.0) return;
  vec3 T;
  vec2 c;
  pieceMoveSite(cell, site, tau, T, c);
  // Rejeição barata: o caco projetado nem chega perto deste pixel.
  float rr = length(c - IMPACT) + 0.03;
  // (o ponto mais longe do centro numa célula fica a ~1,2 célula; para fora, o raio cresce em exponencial)
  float radius = (rr * max(exp(1.2 / radialScale()) - 1.0, 1.2 * 2.0 * PI / angularCells()) + 0.01) * CAM / (CAM + T.z);
  vec2 d0 = p - (c + T.xy) * CAM / (CAM + T.z);
  if (dot(d0, d0) > radius * radius) return;
  vec3 dir = vec3(p, CAM);
  vec3 O = vec3(0.0, 0.0, -CAM);
  mat3 R = pieceTurn(cell, tau);
  vec3 Cw = vec3(c + T.xy, T.z);
  vec3 N = R * vec3(0.0, 0.0, 1.0);
  float den = dot(dir, N);
  if (abs(den) < 1e-4) return;
  float t = dot(Cw - O, N) / den;
  if (t <= 0.0 || t >= hit.t) return;
  vec2 q = c + (transpose(R) * (O + t * dir - Cw)).xy;
  if (lmSdBox(q, vec2(ratio * 0.5, 0.5)) > 0.0) return;
  if (any(notEqual(cellId(nearestCell(toShardSpace(q))), cellId(cell)))) return;
  hit = Hit(t, cell, q, N, tau, den > 0.0);
}

/**
 * Testa os cacos em volta de "base" (no espaço dos cacos). "first" vai antes; se ele está parado no lugar, a
 * busca termina (os cacos que caem passam por trás do vidro ainda inteiro).
 */
void testAround(vec2 base, vec2 first, vec2 p, inout Hit hit) {
  testCell(first, p, hit);
  if (hit.t < 1e8 && hit.tau <= 0.0) return;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      if (all(equal(cellId(cell), cellId(first)))) continue;
      testCell(cell, p, hit);
    }
  }
}

/** Ponto fixo: de onde veio o caco que está aqui, supondo o movimento do caco do palpite atual. */
vec2 settle(vec2 p, vec2 g, out float tau) {
  vec3 T;
  vec2 c;
  tau = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 cell = floor(toShardSpace(g));
    vec2 site = siteOf(cell);
    tau = pieceTime(cell, site);
    pieceMoveSite(cell, site, tau, T, c);
    g = p * (CAM + T.z) / CAM - T.xy;
  }
  return g;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float far = 0.5 * length(vec2(ratio, 1.0)) + length(IMPACT);
  // Dois palpites (o pixel parado e um caco vindo de cima): os vizinhos de cada um são testados.
  Hit hit = Hit(1e9, vec2(0.0), vec2(0.0), vec3(0.0, 0.0, 1.0), 0.0, true);
  if (progress < 0.12) {
    // Antes de qualquer caco cair: só as trincas, sem busca.
    vec2 cell = nearestCell(toShardSpace(p));
    hit = Hit(1.0, cell, p, vec3(0.0, 0.0, 1.0), 0.0, true);
  } else {
    float tauA, tauB;
    vec2 gA = toShardSpace(settle(p, p, tauA));
    vec2 bA = floor(gA);
    testAround(bA, nearestCell(gA), p, hit);
    // Segundo palpite (um caco caindo de cima), só onde o primeiro não achou nada e há caco caindo ali.
    if (hit.t > 1e8) {
      vec2 gB = toShardSpace(settle(p, p + vec2(0.0, 0.35), tauB));
      vec2 bB = floor(gB);
      if (tauB > 0.0 && tauB < 1.0 && any(notEqual(cellId(bA), cellId(bB)))) {
        // Só o caco do palpite e os dois vizinhos na vertical (o caminho da queda).
        vec2 nB = nearestCell(gB);
        testCell(nB, p, hit);
        if (hit.t > 1e8) testCell(nB + vec2(0.0, 1.0), p, hit);
        if (hit.t > 1e8) testCell(nB - vec2(0.0, 1.0), p, hit);
      }
    }
  }
  float bestT = hit.t;
  vec2 bestCell = hit.cell, bestQ = hit.q;
  vec3 bestN = hit.N;
  float bestTau = hit.tau;
  bool front = hit.front;
  vec3 dir = vec3(p, CAM);

  // Fundo: o próximo clipe, escurecido pela sombra dos cacos que ainda estão perto.
  vec4 to = getToColor(uv);
  float near = 1.0 - smoothstep(0.0, 0.55, clamp((progress - 0.12 - 0.38 * clamp(length(p - IMPACT) / far, 0.0, 1.0)) / 0.43, 0.0, 1.0));
  to.rgb *= 1.0 - 0.55 * near * smoothstep(0.1, 0.2, progress);
  if (bestT > 1e8) return to;

  // Trincas: correm do impacto para fora no começo.
  vec2 site = fromShardSpace(siteOf(bestCell));
  vec2 id = cellId(bestCell);
  float crack = smoothstep(0.0, 0.03, progress - 0.11 * clamp(length(site - IMPACT) / far, 0.0, 1.0));
  vec2 shift = (lmHash2(id + 5.5) - 0.5) * lmPx(4.0) * crack;
  vec4 col = getFromColor(lmUncentered(bestQ + shift));
  col.rgb *= 1.0 + (lmHash(id + 1.9) - 0.5) * 0.08 * crack;
  vec2 gq = toShardSpace(bestQ);
  // A mesma célula, mas com o índice local (perto da volta do ângulo os índices diferem de N).
  float bd = borderDist(gq, nearestCell(gq));
  // Do espaço dos cacos para pixels: escala local do espaço polar (média dos dois eixos).
  float r = length(bestQ - IMPACT);
  float scaleLocal = sqrt(angularCells() / (2.0 * PI * max(r, 1e-3)) * radialScale() / (r + 0.02));
  float bdPx = bd / scaleLocal * resolution.y / bestT * max(abs(bestN.z), 0.2);
  // Borda de vidro: linha clara (com um fio escuro por dentro) nas trincas e nos cacos que caem.
  float px1080 = resolution.y / 1080.0;
  float rim = 1.0 - smoothstep(0.3 * px1080, 1.4 * px1080, bdPx);
  float inner = (1.0 - smoothstep(1.2 * px1080, 4.0 * px1080, bdPx)) * (1.0 - rim);
  // A trinca brilha mais em uns trechos que em outros (a luz pega o vidro de jeitos diferentes).
  float glint = 0.45 + 0.55 * smoothstep(-0.4, 0.6, lmNoise(bestQ * 22.0));
  col.rgb = mix(col.rgb, col.rgb * 0.6, inner * 0.45 * crack);
  col.rgb = mix(col.rgb, vec3(1.0), rim * crack * 0.7 * glint);
  // Luz do caco: escurece de lado, verso mais escuro, reflexo quando vira para a luz.
  float moving = smoothstep(0.0, 0.05, bestTau);
  vec3 Nf = front ? -bestN : bestN;
  vec3 V = -normalize(dir);
  vec3 L = normalize(vec3(-0.5, 0.8, -1.0));
  float facing = abs(bestN.z);
  col.rgb *= mix(1.0, mix(0.55, 1.0, facing) * (front ? 1.0 : 0.6), moving);
  float spec = pow(max(dot(reflect(-L, Nf), V), 0.0), 40.0);
  col.rgb = lmAddLight(col.rgb, vec3(0.95, 0.97, 1.0) * spec * 0.9 * moving);
  // Os cacos que caem perdem um fio da borda (a fresta entre eles mostra o fundo).
  float cover = mix(1.0, clamp(bdPx - 0.5, 0.0, 1.0), moving);
  return mix(to, col, cover);
}
