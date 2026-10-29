/** Posição de cada ponto na direção da varredura (0 = onde a linha começa). */
float along(vec2 uv) {
  return direcao > 0.5 ? uv.x : 1.0 - uv.y;
}

float linePosition() {
  return clamp((time - inicio) / varredura, 0.0, 1.0);
}

/** O que a linha já passou fica parado como estava naquele instante; o resto continua ao vivo. */
vec4 state(vec2 uv) {
  bool passed = time >= inicio && along(uv) < linePosition();
  return passed && !firstFrame() ? getPrevious(uv) : getColor(uv);
}

vec4 effect(vec2 uv) {
  vec4 col = getPrevious(uv);
  float l = linePosition();
  if (time >= inicio && l < 1.0) {
    float px = (direcao > 0.5 ? 1.0 / resolution.x : 1.0 / resolution.y) * resolution.y / 720.0;
    float w = (1.0 + espessura * 4.0) * px;
    float dist = abs(along(uv) - l);
    float core = 1.0 - smoothstep(w, w + px, dist);
    float glow = exp(-dist / (w * 6.0)) * 0.6;
    col.rgb = mix(col.rgb + cor * glow, mix(cor, vec3(1.0), 0.4), core);
  }
  return col;
}
