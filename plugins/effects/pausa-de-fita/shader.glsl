float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

bool paused() {
  return time >= momento && (pausa <= 0.0 || time < momento + pausa);
}

/** Até o momento, guarda o quadro; durante a pausa, segura o que ficou guardado. */
vec4 state(vec2 uv) {
  if (paused() && !firstFrame()) return getPrevious(uv);
  return getColor(uv);
}

/** Faixa de chiado da pausa: posição (0 a 1, de baixo para cima) e altura. */
float bar(vec2 uv, float y, float h) {
  return 1.0 - smoothstep(h * 0.4, h, abs(uv.y - y));
}

vec4 effect(vec2 uv) {
  if (!paused()) return getColor(uv);
  float frame = floor(time * 30.0);
  // O quadro parado pula uma linha para cima e para baixo (os dois campos da fita).
  float jump = (mod(frame, 2.0) - 0.5) * 2.0 * tremor / 240.0;
  float shake = (hash(vec2(frame, 4.4)) - 0.5) * 0.003 * tremor;
  vec3 col = getPrevious(vec2(uv.x + shake, uv.y + jump)).rgb;

  float drift = sin(time * 0.9) * 0.015;
  float b = max(bar(uv, 0.16 + drift, 0.035), bar(uv, 0.82 - drift, 0.025)) * ruido;
  if (b > 0.0) {
    float row = floor(uv.y * 240.0);
    vec3 moved = getPrevious(vec2(uv.x + (hash(vec2(row, frame)) - 0.5) * 0.06, uv.y)).rgb;
    float n = hash(floor(uv * resolution / vec2(3.0, 1.5)) + frame * 13.7);
    col = mix(col, mix(moved * 0.7, vec3(n), 0.6), b);
  }
  return vec4(col, 1.0);
}
