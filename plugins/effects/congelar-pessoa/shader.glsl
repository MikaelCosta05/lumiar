// Congelar a pessoa: a pessoa para no meio do movimento e o mundo continua, ou o contrário.
// - O contorno da parte congelada é uma linha fina e lisa por fora da forma: a máscara (alfa do quadro guardado ou
//   a pessoa de agora) é borrada por uma gaussiana de 24 amostras fixas e a distância até a borda sai da inversão
//   dessa máscara borrada. Sem os dentes da busca em 12 direções.
// - O recorte da pessoa congelada tem a borda suave da máscara (sem halo do fundo antigo) e a cor sai com a
//   luminância Rec.709.
bool frozen() {
  return time >= momento && (duracaoGelo <= 0.0 || time < momento + duracaoGelo);
}

/** Até o momento, guarda o quadro (com a pessoa no alfa); depois, segura o que ficou guardado. */
vec4 state(vec2 uv) {
  if (frozen() && !firstFrame()) return getPrevious(uv);
  if (modo < 0.5) return vec4(getColor(uv).rgb, getPerson(uv));
  return vec4(getBackground(uv).rgb, 1.0);
}

vec3 desaturate(vec3 c) {
  return mix(c, vec3(lmLuma(c)), dessaturar);
}

float shape(vec2 uv, bool snapshot) { return snapshot ? getPrevious(uv).a : getPerson(uv); }

/** Linha do lado de fora da forma, de ~0,7 a ~3,5 px de 1080p da borda. */
float outline(vec2 uv, bool snapshot) {
  const float SIGMA = 2.5;
  vec2 toUv = vec2(1.0 / ratio, 1.0) / 1080.0;
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < 24; i++) {
    float r = sqrt((float(i) + 0.5) / 24.0) * 2.5;
    float a = float(i) * 2.39996323;
    float w = exp(-0.5 * r * r);
    sum += shape(uv + vec2(cos(a), sin(a)) * r * SIGMA * toUv, snapshot) * w;
    wsum += w;
  }
  float m = clamp(sum / wsum, 1e-4, 1.0 - 1e-4);
  if (m < 2e-3) return 0.0;
  float d = SIGMA * log((1.0 - m) / m) / 1.702;
  float aa = 0.75 * 1080.0 / resolution.y;
  return 1.0 - smoothstep(1.4 - aa, 1.4 + aa, abs(d - 2.1));
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  if (!frozen()) return base;
  vec4 snap = getPrevious(uv);
  float me = getPerson(uv);
  vec3 col;
  if (modo < 0.5) {
    // A pessoa de agora some (fica o fundo) e a guardada aparece parada no lugar.
    vec3 world = mix(base.rgb, getBackground(uv).rgb, me);
    float a = smoothstep(0.1, 0.9, snap.a);
    col = mix(world, desaturate(snap.rgb), a);
    col = mix(col, vec3(1.0), outline(uv, true) * contorno);
  } else {
    col = mix(desaturate(snap.rgb), base.rgb, me);
    col = mix(col, vec3(1.0), outline(uv, false) * contorno);
  }
  return vec4(col, base.a);
}
