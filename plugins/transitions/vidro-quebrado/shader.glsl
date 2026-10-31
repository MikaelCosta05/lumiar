// Vidro quebrado: a tela leva um impacto no centro e trinca como vidro de verdade, em teia de aranha: trincas
// retas saem do impacto (raios em ângulos irregulares) e trincas concêntricas cortam cada fatia em alturas
// diferentes das vizinhas (junções em T, como no vidro). Os cacos são lascas pequenas perto do impacto e maiores
// para fora. As trincas correm do centro para as bordas; depois os cacos se soltam na mesma ordem e caem com
// gravidade (velocidade inicial + aceleração, cada um com o seu peso), afastando-se da câmera, girando no plano e
// tombando em 3D (encurtam num eixo próprio e escurecem ao virar). Cada caco é um polígono convexo exato (cunha
// entre dois raios ∩ entre duas cordas ∩ tela): borda antisserrilhada em px de 1080p, aresta de vidro brilhante e
// cacos intactos sempre na frente dos que já caíram. O próximo clipe aparece atrás.
// Custo: cada pixel percorre os cacos fatia por fatia (um hash por caco, encadeado), pula as fatias que não
// alcançam o pixel e para na fatia assim que chega a um caco intacto fora dele; só os cacos cujo círculo (já
// deslocado) cobre o pixel pagam o teste exato.
// "Cacos" = densidade: mais cacos = mais raios e mais anéis.

float sectorCount() { return floor(clamp(pieces, 4.0, 20.0) + 0.5) + 3.0; }  // 7 a 23 raios (padrão 12)
float ringCount() { return floor(clamp(pieces, 4.0, 20.0) / 4.0) + 3.0; }     // 4 a 8 anéis (padrão 5)

const float SEED = 0.6180339;
const float ANGLE0 = 0.37;  // giro geral da teia (para nenhum raio ficar na horizontal exata)
const float JIT = 0.22;     // quanto cada trinca concêntrica foge do raio nominal (±)

/** Acaso do raio j (0 a K−1). */
float rayHash(float j, float K) { return lmHash(mod(j, K) + SEED); }
/** Ângulo do raio j (pode passar de K: dá a volta). Espaçamento irregular, sem dois raios se cruzarem. */
float rayAngle(float j, float K) {
  float turns = floor(j / K);
  return (mod(j, K) + (rayHash(j, K) - 0.5) * 0.62) * (2.0 * PI / K) + ANGLE0 + turns * 2.0 * PI;
}

/**
 * Acaso da trinca concêntrica k da fatia j: x e y = desvio do raio dela no raio da esquerda e no da direita,
 * z = acaso do caco que fica por dentro dela (hora de soltar, peso, refração).
 */
vec3 cutHash(float j, float k) { return lmHash3(vec2(j, k) + SEED); }

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

/** Distância com sinal (positiva = fora) do ponto ao caco: cunha entre dl e dr, além da corda interna, aquém da externa. */
float shardDist(vec2 q, vec2 dl, vec2 dr, vec2 rin, vec2 rout) {
  float d = max(-cross2(dl, q), -cross2(q, dr));
  vec2 a = dl * rout.x, b = dr * rout.y;
  vec2 n = normalize(vec2(b.y - a.y, a.x - b.x));
  n *= sign(dot(n, a));
  d = max(d, dot(n, q - a));
  if (rin.x > 0.0) {
    vec2 a0 = dl * rin.x, b0 = dr * rin.y;
    vec2 n0 = normalize(vec2(b0.y - a0.y, a0.x - b0.x));
    n0 *= sign(dot(n0, a0));
    d = max(d, dot(n0, a0 - q));
  }
  // O vidro acaba na borda da tela: nenhum caco leva a faixa esticada de fora do quadro.
  return max(d, lmSdBox(q, vec2(ratio * 0.5, 0.5)));
}

/** Até onde o raio "d" vai antes de sair da tela. */
float toScreenEdge(vec2 d) { return min(ratio * 0.5 / max(abs(d.x), 1e-4), 0.5 / max(abs(d.y), 1e-4)); }

/** Hora de soltar o caco do anel k: base pelo raio nominal (sempre crescente para fora) + acaso da fatia e do caco. */
float releaseBase(float rMid) { return 0.13 + 0.36 * min(rMid, 1.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float K = sectorCount();
  float R = ringCount();
  vec2 p = lmCentered(uv);
  float pr = length(p);
  float pxScale = resolution.y;           // uv de altura → px nativos
  float to1080 = 1080.0 / resolution.y;   // px nativos → px de 1080p

  // Frente das trincas: corre do impacto até os cantos em ~16% da transição (desacelerando).
  float front = 1.15 * lmEaseOutCubic(clamp(progress / 0.16, 0.0, 1.0));
  // Os cacos somem nos últimos quadros, se algum ainda estiver na tela (o fim é exatamente o próximo clipe).
  float tail = 1.0 - smoothstep(0.9, 1.0, progress);

  // Os dois cacos mais próximos da câmera que cobrem o pixel (para o antisserrilhado entre eles).
  float z1 = 1e3, z2 = 1e3;
  vec4 c1 = vec4(0.0), c2 = vec4(0.0);

  // Trincas concêntricas em progressão geométrica de ~0,055 a ~0,95 (do impacto até perto do canto da tela).
  float growth = pow(0.95 / 0.055, 1.0 / max(R - 2.0, 1.0));
  float aL = rayAngle(0.0, K);
  vec2 dL = vec2(cos(aL), sin(aL));
  for (int jj = 0; jj < 23; jj++) {
    float j = float(jj);
    if (j >= K) break;
    float aR = rayAngle(j + 1.0, K);
    vec2 dR = vec2(cos(aR), sin(aR));
    // O pixel está na cunha desta fatia? (cacos intactos só cobrem a própria fatia)
    float inWedge = max(-cross2(dL, p), -cross2(p, dR));
    // Caixa da fatia na tela: os cacos só caem (y) e se abrem um pouco (x); fatias que não alcançam o pixel nem
    // são percorridas.
    float tL = toScreenEdge(dL), tR = toScreenEdge(dR);
    vec2 eL = dL * tL, eR = dR * tR;
    vec2 bbMin = min(min(eL, eR), vec2(0.0)), bbMax = max(max(eL, eR), vec2(0.0));
    for (int ci = 0; ci < 4; ci++) {
      vec2 corner = vec2(ci == 0 || ci == 3 ? ratio : -ratio, ci < 2 ? 1.0 : -1.0) * 0.5;
      if (cross2(dL, corner) >= 0.0 && cross2(corner, dR) >= 0.0) { bbMin = min(bbMin, corner); bbMax = max(bbMax, corner); }
    }
    if (inWedge > 0.0 && (p.y > bbMax.y + 0.2 || p.x < bbMin.x - 0.42 || p.x > bbMax.x + 0.42)) { dL = dR; continue; }
    float sectorDelay = fract(rayHash(j, K) * 7.13) * 0.05;
    vec2 rin = vec2(0.0);
    float nominal = 0.055;
    float tPrev = 0.0;
    vec3 hc = cutHash(j, 1.0);
    for (int kk = 0; kk < 8; kk++) {
      float k = float(kk);
      if (k >= R) break;
      bool last = k + 1.0 >= R;
      vec2 rout = last ? vec2(4.0) : nominal * (1.0 + (hc.xy - 0.5) * 2.0 * JIT);
      float hz = hc.z;
      nominal *= growth;
      vec3 hn = last ? vec3(0.5) : cutHash(j, k + 2.0);  // a próxima trinca (vira a interna do próximo caco)
      vec2 pa = dL * rin.x, pb = dR * rin.y, pc = dR * min(rout.y, tR), pd = dL * min(rout.x, tL);
      vec2 cen = (pa + pb + pc + pd) * 0.25;
      float rc = length(cen);
      // Soltura: do centro para fora, com acaso; nunca antes do caco de dentro (a ordem dentro da fatia vale).
      float t0 = max(releaseBase(rc) + sectorDelay + hz * 0.05, tPrev);
      tPrev = t0;
      float tau = max(progress - t0, 0.0);

      vec2 q;                // ponto do caco (no vidro intacto) que aparece neste pixel
      float scaleOut = 1.0;  // quanto o caco encolheu na tela (para a borda em px)
      float shadeK = 1.0;
      float z = 0.0;
      if (tau <= 0.0) {
        // Intacto: ele e todos os de fora desta fatia ainda estão no lugar. A corda interna passa mais perto do
        // impacto que as suas pontas: vale a distância do impacto à reta dela.
        float chordDist = abs(cross2(pa, pb)) / max(length(pb - pa), 1e-5);
        if (inWedge > 0.02 || pr < chordDist - 0.01) break;
        q = p;
      } else {
        // Queda: velocidade inicial pequena + gravidade (peso de cada caco ±25%), empurrão para fora do impacto.
        float g = 5.2 * (0.75 + 0.5 * fract(hz * 7.31));
        vec2 dir = cen / max(rc, 1e-3);
        vec2 D = vec2(dir.x * 0.22 * tau, -(0.45 * tau + g * tau * tau)) + dir * 0.03 * lmEaseOutCubic(min(tau * 8.0, 1.0));
        float s = 1.0 / (1.0 + 2.2 * tau);  // afasta-se da câmera
        // Teste rápido: o círculo que contém o caco, já deslocado e encolhido.
        vec2 rel = p - cen - D;
        float rb2 = max(max(dot(pa - cen, pa - cen), dot(pb - cen, pb - cen)), max(dot(pc - cen, pc - cen), dot(pd - cen, pd - cen)));
        if (dot(rel, rel) > rb2 * s * s * 1.02 + 2e-5) { rin = rout; hc = hn; continue; }
        vec3 h = lmHash3(vec2(j, k) + 5.17);
        float spin = (h.x - 0.5) * 5.0 * tau;
        float tiltAxis = h.y * PI;
        float tilt = (1.2 + 2.8 * fract(h.z * 5.3)) * sign(h.z - 0.5) * tau * 2.2;
        float ct = cos(tilt);
        float fore = max(abs(ct), 0.12);
        // Inverso: desfaz o encolhimento, o tombo (encurtamento no eixo do tombo) e o giro.
        vec2 l = lmRotate(rel / s, tiltAxis);
        l.x /= fore;
        l = lmRotate(l, -tiltAxis);
        q = cen + lmRotate(l, -spin);
        scaleOut = s * mix(1.0, fore, 0.5);
        // Luz: escurece ao tombar, verso (cos < 0) mais escuro, um brilho quando passa pelo ângulo da luz.
        shadeK = mix(0.42, 1.0, abs(ct)) * (ct < 0.0 ? 0.7 : 1.0) + 0.35 * pow(max(sin(tilt + 0.6), 0.0), 24.0);
        z = tau + hz * 1e-3;
      }
      float sd = shardDist(q, dL, dR, rin, rout);
      float edgePx = -sd * scaleOut * pxScale;  // px nativos até a borda (positivo = dentro)
      float cov = clamp(edgePx + 0.5, 0.0, 1.0);
      if (cov > 0.0) {
        // Trinca visível só depois que a frente passou por ali.
        float cracked = smoothstep(0.0, 0.05, front - length(q));
        // Imagem presa no caco, com um desvio mínimo de refração e um brilho próprio por caco depois de trincar.
        vec2 refr = (fract(vec2(hz * 13.7, hz * 29.3)) - 0.5) * lmPx(3.0) * cracked;
        vec3 img = lmToLinear(getFromColor(clamp(lmUncentered(q) + refr, 0.0, 1.0)).rgb);
        img *= (1.0 + (fract(hz * 41.9) - 0.5) * 0.18 * cracked) * shadeK;
        // Aresta: linha fina clara (luz no vidro partido) e uma sombra estreita para dentro.
        float e = edgePx * to1080;
        float line = (1.0 - smoothstep(0.4, 1.6, e)) * cracked;
        float halo = (1.0 - smoothstep(1.2, 4.5, e)) * cracked;
        img = img * (1.0 - 0.3 * halo) + vec3(0.62) * line * (z > 0.0 ? 1.2 : 1.0);
        vec4 c = vec4(img, cov * (z > 0.0 ? tail : 1.0));
        if (z < z1) { z2 = z1; c2 = c1; z1 = z; c1 = c; }
        else if (z < z2) { z2 = z; c2 = c; }
      }
      rin = rout;
      hc = hn;
    }
    dL = dR;
  }
  vec3 behind = lmToLinear(getToColor(uv).rgb);
  vec3 lin = mix(mix(behind, c2.rgb, c2.a), c1.rgb, c1.a);
  // Clarão curto do impacto.
  float hit = exp(-pr * 10.0) * exp(-progress * 28.0) * smoothstep(0.0, 0.015, progress);
  lin += vec3(0.85) * hit;
  return vec4(lmToSrgb(lin), 1.0);
}
