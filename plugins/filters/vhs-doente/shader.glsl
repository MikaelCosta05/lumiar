float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

/** Ruído sem seno (estável em qualquer placa). */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Grão animado (-0.5 a 0.5), do mesmo tamanho em qualquer resolução. */
float grainAt(vec2 uv, float size) {
  vec2 cell = floor(uv * resolution / max(size * resolution.y / 720.0, 1.0));
  return hash(cell + vec2(mod(floor(time * 24.0), 113.0) * 17.31, 3.7)) - 0.5;
}

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  float frame = floor(time * 30.0);
  // Faixa de tracking subindo devagar: as linhas dentro dela tremem para os lados.
  float dy = abs(fract(uv.y - fract(time * 0.08) + 0.5) - 0.5);
  float inBand = (1.0 - smoothstep(0.0, 0.035, dy)) * track;
  float row = floor(uv.y * resolution.y / (2.0 * k));
  float jitter = (hash(vec2(row, frame)) - 0.5) * 0.03 * inBand + (hash(vec2(row, frame + 7.0)) - 0.5) * 0.0015;
  vec2 q = vec2(uv.x + jitter, uv.y);
  vec3 base = getColor(q).rgb;
  // A cor escorre para a direita (a fita guarda a cor com pouca definição).
  vec2 px = vec2(2.5 * k / resolution.x, 0.0);
  vec3 smear = (getColor(q - px).rgb + getColor(q - px * 2.0).rgb + getColor(q - px * 3.0).rgb + getColor(q - px * 4.0).rgb) * 0.25;
  smear = mix(base, smear, 0.75);
  float l = luma(base);
  vec3 col = vec3(l) + (smear - luma(smear)) * 0.9;
  vec3 sickCol = saturate(col, 0.5) * vec3(0.9, 1.02, 0.66);
  sickCol = sickCol * 0.86 + vec3(0.05, 0.08, 0.03);
  sickCol = mix(sickCol, vec3(0.95, 0.95, 0.62) * luma(sickCol) * 1.1, smoothstep(0.7, 1.0, l) * 0.4);
  col = mix(col, sickCol, sick);
  col *= 0.95 + 0.05 * sin(uv.y * resolution.y * 1.5708 / k);
  col += grainAt(uv, 1.5) * 0.05;
  col += inBand * hash(vec2(floor(uv.x * 300.0), row + frame)) * 0.25 * vec3(0.9, 1.0, 0.85);
  col *= vignette(uv, 0.35);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
