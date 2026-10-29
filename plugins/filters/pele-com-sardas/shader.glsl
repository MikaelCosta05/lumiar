float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1.0e-6)), d / (q.x + 1.0e-6), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

/** 1 perto do matiz `center` (0 a 1, dá a volta), 0 a partir de `width` de distância. */
float hueBand(float h, float center, float width) {
  float d = abs(fract(h - center + 0.5) - 0.5);
  return 1.0 - smoothstep(width * 0.5, width, d);
}

/** Onde a cor parece pele (matiz entre o vermelho e o amarelo, saturação moderada). */
float skinMask(vec3 c, float width) {
  vec3 h = rgb2hsv(c);
  return hueBand(h.x, 0.07, width) * smoothstep(0.08, 0.2, h.y) * (1.0 - smoothstep(0.65, 0.85, h.y)) * smoothstep(0.12, 0.3, h.z);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 st = vec2(1.6 * k) / resolution;
  vec3 center = c.rgb;
  // Desfoque que respeita bordas: quanto mais detalhe guardado, mais exigente com a diferença de cor.
  float sharpness = mix(30.0, 160.0, keep);
  vec3 sum = center;
  float wsum = 1.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) continue;
      vec3 s = getColor(uv + vec2(float(i), float(j)) * st).rgb;
      vec3 d = s - center;
      float w = exp(-dot(d, d) * sharpness);
      sum += s * w;
      wsum += w;
    }
  }
  vec3 smoothed = sum / wsum;
  // Sardas e pintas: pontos mais escuros que a pele em volta voltam como estavam.
  float freckle = smoothstep(0.025, 0.07, luma(smoothed) - luma(center)) * keep;
  vec3 col = mix(smoothed, center, freckle);
  // Um pouco da textura fina volta, para a pele não parecer de plástico.
  vec2 p = vec2(k) / resolution;
  vec3 fine = center - (getColor(uv + vec2(p.x, 0.0)).rgb + getColor(uv - vec2(p.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, p.y)).rgb + getColor(uv - vec2(0.0, p.y)).rgb) * 0.25;
  col += fine * keep * 0.35;
  float skin = clamp(skinMask(center, 0.1) * 1.2, 0.0, 1.0);
  col = mix(center, col, smoothAmt * skin);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
