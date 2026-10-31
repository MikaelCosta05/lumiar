// Desintegrar: a pessoa vira poeira e voa com o vento (o estalo do Thanos). Invertido, ela se forma.
// - A frente de quebra avança do lado de onde o vento vem, com borda orgânica (ruído suave) e falhas grão a grão (acaso
//   por célula da biblioteca, sem os padrões do seno).
// - Os grãos são redondos (borda antisserrilhada), encolhem e somem enquanto voam; o vento tem redemoinhos de
//   curl noise (desloca sem comprimir) e a poeira sobe aos poucos, levada pelo ar.
// - A frente acesa (brasa) soma como luz em luz linear.
// - Onde a pessoa já sumiu entra o fundo preenchido pelas cores em volta (como no "Apagar o objeto"), com a máscara
//   um pouco maior: não sobra o contorno do cabelo desenhado na parede.
// Tamanho dos grãos em px de 1080p.
float grainPx;

/** Ruído de valor (acaso por célula da biblioteca, curva quíntica): barato, sem senos, para texturas finas. */
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = lmCellHash(i), b = lmCellHash(i + vec2(1.0, 0.0));
  float c = lmCellHash(i + vec2(0.0, 1.0)), d = lmCellHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}


/** Quando cada grão se solta (0 a 0,65): primeiro o lado de onde o vento vem, com borda irregular e falhas. */
float releaseAt(vec2 cell, vec2 dir) {
  vec2 c = (cell + 0.5) * grainPx / resolution;
  float along = clamp(0.5 + dot(c - 0.5, dir) * 1.2, 0.0, 1.0);
  float organic = valueNoise(lmCentered(c) * 6.0 + 3.0);
  return (along * 0.55 + organic * 0.25 + lmCellHash(cell) * 0.2) * 0.65;
}

const int STEPS = 28;
const float FLIGHT = 0.35;

/** 1 = fundo livre: nem a pessoa nem a borda dela num raio "r" em volta (ponto + 3 vizinhos girados por "a"). */
float clearAt(vec2 p, float r, float a) {
  float m = getPerson(p);
  if (m >= 0.4) return 0.0; // dentro da pessoa: nem olha em volta (a maior parte das amostras de um buraco grande)
  for (int i = 0; i < 3; i++) {
    float b = a + float(i) * 2.0943951;
    m = max(m, getPerson(p + vec2(cos(b) / ratio, sin(b)) * r));
  }
  return 1.0 - smoothstep(0.08, 0.4, m);
}

/**
 * O que estava atrás da pessoa (o mesmo preenchimento do "Apagar o objeto"): as cores do fundo livre em volta, em
 * anéis de raio crescente, com peso maior para as mais perto e lidas de um nível de detalhe que acompanha a distância.
 * Um degradê liso, sem o contorno escuro nem as estrias em leque de pegar o primeiro pixel fora da máscara.
 */
vec3 behind(vec2 uv, float margin) {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  int found = -1;
  for (int ring = 0; ring < 9; ring++) {
    if (found >= 0 && ring > found + 3) break;
    float r = 0.006 * pow(110.0, (float(ring) + 0.5) / 9.0);
    float level = clamp(log2(max(r * resolution.y * 0.07, 1.0)), 0.0, 4.5);
    float blurR = exp2(level) / resolution.y;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988 + float(ring) * 1.3;
      vec2 p = uv + vec2(cos(a) / ratio, sin(a)) * r;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) continue;
      float ok = clearAt(p, margin + blurR * 1.5, a + 3.1415927);
      if (ok <= 0.0) continue;
      float w = ok / (r * r * r);
      sum += lmToLinear(getColorLod(p, level).rgb) * w;
      total += w;
    }
    if (found < 0 && total > 0.0) found = ring;
  }
  return total > 0.0 ? lmToSrgb(sum / total) : getColor(uv).rgb;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float p = clamp((time - inicio) / duracaoPo, 0.0, 1.0);
  if (inverter > 0.5) p = 1.0 - p;
  if (p <= 0.0) return base;
  grainPx = max(tamanho * resolution.y / 1080.0, 1.0);
  float a = radians(angulo);
  vec2 dir = vec2(cos(a), sin(a));

  // A pessoa: o que já se soltou dá lugar ao fundo (o que estava atrás dela); a frente de quebra acende.
  vec3 col = base.rgb;
  float me = getPerson(uv);
  // A máscara é justa: os fios soltos do cabelo e a franja da borda ficam fora dela e, sem isto, sobra o contorno da
  // pessoa desenhado no fundo depois que ela some. O que some é a máscara um pouco maior.
  float reach = lmPx(14.0);
  float around = me;
  for (int i = 0; i < 8; i++) {
    float b = float(i) * 0.7853982 + 0.39;
    vec2 o = vec2(cos(b) / ratio, sin(b));
    around = max(around, getPerson(uv + o * reach) * 0.85);
  }
  float gone = smoothstep(0.08, 0.5, around);
  vec2 cell = floor(uv * resolution / grainPx);
  float release = releaseAt(cell, dir);
  if (gone > 0.01) {
    float intact = step(p, release);
    if (intact < 1.0) col = mix(base.rgb, behind(uv, reach * 1.4), gone);
    float front = 1.0 - smoothstep(0.0, 0.035, release - p);
    col = lmAddLight(col, vec3(1.0, 0.45, 0.12) * front * intact * me * brasa * 0.9);
  }

  // Grãos voando: para cada idade possível, de onde teria vindo o grão que está aqui agora.
  vec3 ash = vec3(0.32, 0.3, 0.28);
  vec2 swirl = lmCurl(lmCentered(uv) * 2.0, p * 2.0) * 0.05;
  for (int k = 0; k < STEPS; k++) {
    float age = (float(k) + 0.5) / float(STEPS) * FLIGHT;
    if (age > p) break;
    vec2 drift = dir * age * 1.1 + swirl * age;
    drift.y += age * age * 0.6;
    vec2 src = uv - drift;
    vec2 g = src * resolution / grainPx;
    vec2 scell = floor(g);
    vec2 center = (scell + 0.5) * grainPx / resolution;
    if (lmCellHash(scell + 7.0) > 0.62 || getPerson(center) < 0.5) continue;
    if (abs(p - releaseAt(scell, dir) - age) > FLIGHT / float(STEPS) * 0.6) continue;
    // Grão redondo que encolhe com a idade.
    float life = age / FLIGHT;
    float radius = 0.5 * (1.0 - 0.45 * life);
    float dist = length(fract(g) - 0.5);
    float cover = grainPx < 2.5 ? 1.0 : clamp((radius - dist) * grainPx + 0.5, 0.0, 1.0);
    if (cover <= 0.0) continue;
    vec3 grain = mix(getColor(center).rgb, ash, cinza);
    float fade = 1.0 - life;
    col = mix(col, grain, fade * cover);
    if (cover > 0.5) break;
  }
  return vec4(col, base.a);
}
