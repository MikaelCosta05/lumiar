// Trocar o céu. A máscara do céu junta as pistas: longe (profundidade da IA), claro ou azulado, e na parte de cima.
// A borda é amaciada por uma média em volta em px de 1080p, e o primeiro plano recebe um pouco da luz do céu novo
// na borda (light wrap), como numa composição profissional. Nuvens, aurora e névoa com ruído fbm de gradiente (sem o quadriculado do
// acaso por seno) e estrelas de tamanho e brilho variados, sem serrilhado.

/** Quanto o ponto parece céu: longe (profundidade), claro ou azulado e na parte de cima. */
float skyAt(vec2 uv) {
  float d = getDepth(uv);
  float t = mix(0.03, 0.3, limite);
  float soft = 0.02 + suavidade * 0.08;
  float far = 1.0 - smoothstep(t - soft, t + soft, d);
  vec3 c = getColor(uv).rgb;
  float l = lmLuma(c);
  float looks = smoothstep(0.35, 0.6, l + (c.b - c.r) * 0.6);
  return far * mix(0.1, 1.0, looks) * smoothstep(0.12, 0.42, uv.y);
}

float cloudNoise(vec2 p) { return 0.5 + 0.7 * lmFbm(p, 5); }

float stars(vec2 s) {
  vec2 g = s * 90.0;
  vec2 cell = floor(g);
  vec3 h = lmHash3(cell + 0.5);
  if (h.x < 0.985) return 0.0;
  vec2 f = g - cell - (0.25 + 0.5 * h.yz);
  float size = mix(0.06, 0.16, h.y);
  float twinkle = 0.65 + 0.35 * lmNoise(vec2(time * 1.5, h.z * 80.0));
  float core = exp(-dot(f, f) / (size * size));
  return core * twinkle * mix(0.35, 1.0, h.z * h.z);
}

vec3 newSky(vec2 uv) {
  vec2 s = vec2(uv.x * ratio, uv.y);
  float h = uv.y;
  float drift = time * velocidade * 0.04;
  int kind = int(ceu + 0.5);
  if (kind == 0) {
    // Pôr do sol: laranja no horizonte, rosa no meio, azul escuro em cima; sol com halo e nuvens rosadas.
    vec3 col = mix(vec3(1.0, 0.6, 0.25), vec3(0.88, 0.36, 0.45), smoothstep(0.25, 0.6, h));
    col = mix(col, vec3(0.13, 0.16, 0.42), smoothstep(0.55, 1.0, h));
    float sun = length(s - vec2(0.7 * ratio, 0.4));
    col += vec3(1.0, 0.75, 0.4) * (exp(-sun * 5.0) * 0.6 + exp(-sun * 16.0) * 0.35);
    col = mix(col, vec3(1.0, 0.93, 0.7), 1.0 - smoothstep(0.048, 0.056, sun));
    float c = smoothstep(0.52, 0.80, cloudNoise(s * vec2(2.0, 6.0) + vec2(drift, 0.0)));
    return mix(col, mix(vec3(0.95, 0.48, 0.55), vec3(1.0, 0.82, 0.62), 1.0 - h), c * 0.85 * smoothstep(0.3, 0.7, h));
  }
  if (kind == 1) {
    // Noite estrelada com lua.
    vec3 col = mix(vec3(0.09, 0.13, 0.32), vec3(0.015, 0.025, 0.08), smoothstep(0.3, 1.0, h));
    col += vec3(0.25, 0.25, 0.4) * smoothstep(0.55, 0.85, cloudNoise(s * 3.0 + vec2(drift * 0.5, 0.0))) * 0.25;
    col += stars(s);
    float moon = length(s - vec2(0.25 * ratio, 0.75));
    col += vec3(0.8, 0.85, 1.0) * (exp(-moon * 9.0) * 0.3 + exp(-moon * 30.0) * 0.2);
    return mix(col, vec3(0.95, 0.95, 0.88), 1.0 - smoothstep(0.044, 0.05, moon));
  }
  if (kind == 2) {
    // Aurora: cortinas verdes e roxas ondulando sobre a noite, com estrias verticais finas.
    vec3 col = mix(vec3(0.03, 0.09, 0.14), vec3(0.01, 0.02, 0.06), smoothstep(0.3, 1.0, h));
    col += stars(s) * 0.8;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float y0 = 0.55 + fi * 0.11 + lmNoise(vec2(s.x * 1.2 + time * velocidade * 0.3, fi * 7.0)) * 0.08 + lmFbm(vec2(s.x * 1.5, time * 0.1 + fi), 3) * 0.08;
      float dy = h - y0;
      // Mais luz embaixo da cortina (borda de baixo nítida, sobe se apagando).
      float band = exp(-max(dy, 0.0) * 9.0 - max(-dy, 0.0) * 40.0);
      float rays = 0.55 + 0.45 * lmNoise(vec2(s.x * 40.0 + lmFbm(s * 4.0 + fi, 3) * 6.0, time * 0.2 + fi));
      col += mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 1.0), smoothstep(0.0, 0.15, dy) * (0.4 + fi * 0.3)) * band * rays * 0.7;
    }
    return col;
  }
  // Céu azul com nuvens brancas, sombreadas embaixo.
  vec3 col = mix(vec3(0.7, 0.85, 1.0), vec3(0.18, 0.42, 0.88), smoothstep(0.3, 1.0, h));
  vec2 cp = s * vec2(2.2, 4.5) + vec2(drift, 0.0);
  float c = smoothstep(0.48, 0.75, cloudNoise(cp));
  float below = smoothstep(0.48, 0.75, cloudNoise(cp + vec2(0.0, 0.08)));
  vec3 cloud = mix(vec3(0.97), vec3(0.78, 0.82, 0.9), clamp(below - c, 0.0, 1.0) * 1.5);
  return mix(col, cloud, c * 0.9);
}

vec3 sceneLight() {
  int kind = int(ceu + 0.5);
  if (kind == 0) return vec3(1.12, 0.86, 0.72);
  if (kind == 1) return vec3(0.45, 0.52, 0.8);
  if (kind == 2) return vec3(0.5, 0.78, 0.75);
  return vec3(1.02, 1.02, 1.05);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  // Máscara do céu com a borda amaciada (média com 8 vizinhos a 2–8 px de 1080p, conforme a suavidade).
  vec2 r = lmPxUv(2.0 + suavidade * 6.0);
  float own = skyAt(uv);
  float around = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    around += skyAt(uv + vec2(cos(a), sin(a)) * r);
  }
  around /= 8.0;
  float sky = own * 0.4 + around * 0.6;
  vec3 skyCol = newSky(uv);
  vec3 ground = mix(base.rgb, base.rgb * sceneLight(), luz);
  // Light wrap: o primeiro plano encostado no céu recebe um pouco da luz dele.
  float wrap = clamp(around - own, 0.0, 1.0) * (1.0 - sky) * luz;
  ground = lmToSrgb(lmToLinear(ground) + lmToLinear(skyCol) * wrap * 0.45);
  return vec4(mix(ground, skyCol, sky), base.a);
}
