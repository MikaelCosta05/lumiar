// Time warp scan: uma linha atravessa a tela em velocidade constante (para dar para acompanhar com o corpo) e o que
// ela já passou fica congelado no estado. A linha tem espessura em px de 1080p, borda suavizada e um brilho em duas
// camadas (estreito e largo) somado como luz, sem estourar a imagem.

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

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec4 col = getPrevious(uv);
  float l = linePosition();
  if (time >= inicio && l < 1.0) {
    // Distância até a linha em altura de tela (o mesmo px nos dois sentidos).
    float dist = abs(along(uv) - l) * (direcao > 0.5 ? ratio : 1.0);
    float w = lmPx(0.75 + espessura * 3.0);
    float aa = max(fwidth(dist), lmPx(0.5));
    float core = 1.0 - smoothstep(w - aa, w + aa, dist);
    vec3 c = lmToLinear(cor);
    vec3 glow = c * (exp(-dist / (w * 4.0 + lmPx(2.0))) * 0.55 + exp(-dist / (w * 20.0 + lmPx(10.0))) * 0.18);
    vec3 lin = addLightSoft(lmToLinear(col.rgb), glow);
    lin = mix(lin, mix(c, vec3(1.0), 0.45), core);
    col.rgb = lmToSrgb(lin);
  }
  return col;
}
