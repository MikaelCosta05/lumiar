float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += vnoise(p) * a;
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/** Quanto o ponto parece céu: longe (profundidade), claro ou azulado, e na parte de cima. */
float skyAt(vec2 uv) {
  float d = getDepth(uv);
  float t = mix(0.03, 0.3, limite);
  float soft = 0.02 + suavidade * 0.08;
  float far = 1.0 - smoothstep(t - soft, t + soft, d);
  // Montanhas também ficam longe: o céu ainda precisa ser claro ou azulado.
  vec3 c = getColor(uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float looks = smoothstep(0.35, 0.6, l + (c.b - c.r) * 0.6);
  return far * mix(0.1, 1.0, looks) * smoothstep(0.12, 0.42, uv.y);
}

float stars(vec2 s) {
  vec2 cell = floor(s * 90.0);
  float h = hash(cell);
  vec2 f = fract(s * 90.0) - 0.5;
  float twinkle = 0.6 + 0.4 * sin(time * 3.0 + h * 40.0);
  return step(0.986, h) * (1.0 - smoothstep(0.05, 0.25, length(f))) * twinkle;
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
    col += vec3(1.0, 0.75, 0.4) * exp(-sun * 5.0) * 0.7;
    col = mix(col, vec3(1.0, 0.93, 0.7), 1.0 - smoothstep(0.05, 0.058, sun));
    float c = smoothstep(0.52, 0.78, fbm(s * vec2(2.0, 6.0) + vec2(drift, 0.0)));
    return mix(col, mix(vec3(0.95, 0.48, 0.55), vec3(1.0, 0.82, 0.62), 1.0 - h), c * 0.85 * smoothstep(0.3, 0.7, h));
  }
  if (kind == 1) {
    // Noite estrelada com lua.
    vec3 col = mix(vec3(0.09, 0.13, 0.32), vec3(0.015, 0.025, 0.08), smoothstep(0.3, 1.0, h));
    col += vec3(0.25, 0.25, 0.4) * smoothstep(0.55, 0.8, fbm(s * 3.0 + vec2(drift * 0.5, 0.0))) * 0.25;
    col += stars(s);
    float moon = length(s - vec2(0.25 * ratio, 0.75));
    col += vec3(0.8, 0.85, 1.0) * exp(-moon * 9.0) * 0.4;
    return mix(col, vec3(0.95, 0.95, 0.88), 1.0 - smoothstep(0.045, 0.05, moon));
  }
  if (kind == 2) {
    // Aurora: faixas verdes e roxas ondulando sobre a noite.
    vec3 col = mix(vec3(0.03, 0.09, 0.14), vec3(0.01, 0.02, 0.06), smoothstep(0.3, 1.0, h));
    col += stars(s) * 0.8;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float y0 = 0.55 + fi * 0.11 + sin(s.x * 2.0 + time * velocidade + fi * 2.1) * 0.06 + (fbm(vec2(s.x * 1.5, time * 0.1 + fi)) - 0.5) * 0.15;
      float band = exp(-abs(h - y0) * 18.0) * (0.55 + 0.45 * sin(s.x * 70.0 + fbm(s * 4.0 + fi) * 12.0));
      col += mix(vec3(0.1, 1.0, 0.55), vec3(0.65, 0.25, 1.0), fi / 2.0) * band * 0.75;
    }
    return col;
  }
  // Céu azul com nuvens brancas.
  vec3 col = mix(vec3(0.7, 0.85, 1.0), vec3(0.18, 0.42, 0.88), smoothstep(0.3, 1.0, h));
  float c = smoothstep(0.48, 0.72, fbm(s * vec2(2.2, 4.5) + vec2(drift, 0.0)));
  return mix(col, vec3(0.97), c * 0.9);
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
  // Máscara do céu com a borda amaciada (média com os vizinhos).
  vec2 px = 2.0 / resolution;
  float sky = skyAt(uv) * 0.4;
  sky += (skyAt(uv + vec2(px.x, 0.0)) + skyAt(uv - vec2(px.x, 0.0)) + skyAt(uv + vec2(0.0, px.y)) + skyAt(uv - vec2(0.0, px.y))) * 0.15;
  vec3 ground = mix(base.rgb, base.rgb * sceneLight(), luz);
  return vec4(mix(ground, newSky(uv), sky), base.a);
}
