// Fita amassada: onde a fita dobrou, a cabeça perde o contato por um instante. Passa uma faixa em que as linhas
// se espremem e deslizam de lado, a fase da cor (NTSC) se perde e a croma gira pelo arco-íris ao longo da linha,
// e o sinal vira chiado em riscos deitados. A faixa anda alguns pontos pela tela enquanto o vinco passa (~0,7 s).
// Dropouts: riscos curtos de uma linha onde faltou óxido, quase sempre brancos (às vezes pretos), com um rabo que
// apaga. Tudo muda a cada quadro de vídeo (29,97 por segundo), em 480 linhas.

const float LINES = 480.0;

vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }

float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 29.97);
  float line = floor((1.0 - uv.y) * LINES);
  vec2 u = uv;
  float crease = 0.0;
  float phase = 0.0;

  // Até dois vincos ao mesmo tempo, cada um num trecho de ~0,7 s, em lugar sorteado.
  for (int i = 0; i < 2; i++) {
    float slot = floor(time * 1.4 + float(i) * 0.5);
    float seed = slot * 3.17 + float(i) * 11.3;
    if (lmHash(vec2(seed, 1.0)) > amassados) continue;
    float life = fract(time * 1.4 + float(i) * 0.5);
    float y0 = 0.1 + 0.8 * lmHash(vec2(seed, 2.0)) - lmEaseInOutSine(life) * 0.08;
    float hh = (0.015 + 0.06 * lmHash(vec2(seed, 3.0))) * tamanho * 2.0;
    // Borda irregular de linha para linha.
    float d = (uv.y - y0) / hh * (1.0 + 0.25 * lmNoise(vec2(line * 0.3, frame * 0.5)));
    if (abs(d) < 1.0) {
      float w = (1.0 - d * d) * lmBell(life);
      // A imagem dentro do vinco é espremida para o meio e puxada de lado, linha por linha.
      u.y = y0 + (uv.y - y0) * (1.0 - 0.7 * w);
      u.x += lmPxUv((lmHash(vec3(line, frame, seed)) - 0.5) * 50.0 * w + 22.0 * w).x;
      if (w > crease) {
        crease = w;
        phase = lmHash(vec2(seed, 4.0)) * 6.283 + time * 9.0;
      }
    }
  }

  vec3 yiq = toYiq(getColor(u).rgb);
  if (crease > 0.0) {
    // A fase da cor se perde: a croma gira ao longo da linha (arco-íris) e ganha força.
    float a = phase + uv.x * 14.0 + line * 0.35;
    float s = sin(a), c = cos(a);
    vec2 iq = mat2(c, s, -s, c) * (yiq.yz + vec2(0.06, 0.03));
    yiq.yz = mix(yiq.yz, iq * 1.6, crease * 0.9);
    // Luma em riscos: metade sinal, metade chiado.
    float n = streak(uv.x * 300.0, line, frame) * 0.6 + streak(uv.x * 90.0, line, frame + 0.5) * 0.4;
    yiq.x = mix(yiq.x, yiq.x * 0.75 + 0.15 + n * 0.25, crease * 0.75);
    // Algumas linhas inteiras somem (a cabeça sem contato).
    yiq.x *= 1.0 - 0.35 * crease * step(0.6, lmHash(vec3(line, frame, 2.0)));
  }

  // Dropouts: um risco de uma linha com começo nítido e rabo que apaga (o compensador do aparelho tentando).
  float on = step(1.0 - dropouts * 0.016, lmHash(vec3(line, frame, 5.0)));
  if (on > 0.0) {
    float x0 = lmHash(vec3(line, frame, 6.0));
    float len = 0.02 + 0.12 * lmHash(vec3(line, frame, 7.0));
    float t = (uv.x - x0) / len;
    float body = smoothstep(-0.03, 0.0, t) * (1.0 - smoothstep(0.3, 1.0, t));
    body *= 0.8 + 0.2 * streak(uv.x * 400.0, line, frame);
    float white = step(0.2, lmHash(vec3(line, frame, 8.0)));
    yiq.x = mix(yiq.x, mix(0.04, 0.97, white), body);
    yiq.yz *= 1.0 - body;
  }
  return vec4(clamp(toRgb(yiq), 0.0, 1.0), 1.0);
}
