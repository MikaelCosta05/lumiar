// Pausa de fita: o videocassete para a fita e a cabeça fica lendo o mesmo trecho. A imagem parada é um campo só
// (240 linhas, com as linhas repetidas), pulando uma linha para cima e para baixo a cada quadro, e as faixas de
// chiado aparecem onde a cabeça cruza de uma trilha para a outra: linhas tortas, sem cor e com riscos brancos
// deitados. As faixas derivam devagar. Sem chiado e sem tremor, vira um congelamento limpo.

const float LINES = 480.0;

bool paused() {
  return time >= momento && (pausa <= 0.0 || time < momento + pausa);
}

/** Até o momento, guarda o quadro; durante a pausa, segura o que ficou guardado. */
vec4 state(vec2 uv) {
  if (paused() && !firstFrame()) return getPrevious(uv);
  return getColor(uv);
}

float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

/** Faixa de chiado: posição (0 a 1, de baixo para cima) e meia altura. */
float bar(float y, float center, float h) {
  return 1.0 - smoothstep(h * 0.35, h, abs(y - center));
}

vec4 effect(vec2 uv) {
  if (!paused()) return getColor(uv);
  float frame = floor(time * 29.97);
  float line = floor((1.0 - uv.y) * LINES);

  // Um campo só: as linhas saem em pares; a cada quadro o campo mostrado pula uma linha.
  float jump = (mod(frame, 2.0) - 0.5) * tremor / 240.0;
  float fieldY = (floor(uv.y * 240.0) + 0.5) / 240.0;
  float y = mix(uv.y, fieldY, step(0.001, tremor)) + jump;
  float shake = (lmHash(vec2(frame, 4.4)) - 0.5) * lmPxUv(5.0).x * tremor;
  vec3 col = getPrevious(vec2(uv.x + shake, y)).rgb;

  // Duas faixas de chiado (onde a cabeça cruza as trilhas), derivando devagar.
  float drift = lmNoise(vec2(time * 0.4, 1.0)) * 0.02;
  float b = max(bar(uv.y, 0.16 + drift, 0.035), bar(uv.y, 0.82 - drift, 0.025)) * ruido;
  if (b > 0.0) {
    float push = (lmHash(vec3(line, frame, 1.0)) - 0.5) * 60.0 + 20.0;
    vec3 moved = getPrevious(vec2(uv.x - lmPxUv(push * b).x, y)).rgb;
    float l = lmLuma(moved);
    float n = streak(uv.x * 380.0, line, frame) * 0.6 + streak(uv.x * 110.0, line, frame + 0.5) * 0.4;
    vec3 noisy = vec3(l * 0.6 + 0.18 + n * 0.22);
    float white = smoothstep(0.8, 0.95, streak(uv.x * 160.0, line, frame + 0.25) * 0.5 + 0.5) * b;
    col = mix(col, noisy, b);
    col = mix(col, vec3(0.92), white * 0.8);
  }
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
