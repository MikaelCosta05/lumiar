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
  vec3 hsv = rgb2hsv(c.rgb);
  float skin = skinMask(c.rgb, 0.12);
  // Matiz com sinal em volta do vermelho: a pele bonita fica perto de 0,07.
  float h = hsv.x > 0.5 ? hsv.x - 1.0 : hsv.x;
  h = mix(h, 0.068, even * 0.55);
  float s = mix(hsv.y, clamp(hsv.y, 0.22, 0.48), even * 0.5);
  vec3 fixedSkin = hsv2rgb(vec3(fract(h), s, hsv.z));
  fixedSkin *= vec3(1.0 + 0.06 * warmth, 1.0 + 0.012 * warmth, 1.0 - 0.06 * warmth);
  fixedSkin += 0.02 * warmth * smoothstep(0.2, 0.6, hsv.z);
  vec3 col = mix(c.rgb, fixedSkin, skin);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
