// Entrar pelo olho: a câmera mergulha num olho (zoom exponencial com o olho indo para o centro) até a pupila
// escura tomar a tela, e o próximo clipe se abre de dentro dela como uma íris, com a câmera recuando.
// O desfoque de movimento integra o próprio mergulho no tempo do obturador (até 32 instantes com ruído
// intercalado, cada um lendo o nível de detalhe do tamanho do passo), sem as cópias fantasmas de antes.
// As fibras da íris são ruído de gradiente amostrado num círculo (sem emenda no ângulo).

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

/** O clipe atual com zoom no olho no instante e (0 a 1), em luz linear, sem a pupila. */
vec3 diveColor(vec2 uv, float e, float lod) {
  vec2 eye = vec2(ponto.x, 1.0 - ponto.y);
  float scale = pow(profundidade, e);
  vec2 view = mix(eye, vec2(0.5), smoothstep(0.0, 0.6, e));
  return lmToLinear(getFromColorLod(mirrorUv(eye + (uv - view) / scale), lod).rgb);
}

/** Segunda metade: o próximo clipe aparece num círculo que abre do centro, com a íris em volta. */
vec3 openColor(vec2 uv, float e) {
  vec2 q = lmCentered(uv);
  float r = length(q);
  float hole = e * e * 1.2;
  // Recua de leve enquanto abre: a câmera sai de dentro do olho.
  float scale = mix(1.6, 1.0, lmEaseOutCubic(e));
  vec3 next = lmToLinear(getToColor(0.5 + (uv - 0.5) / scale).rgb);
  float inside = lmFill(r - hole + lmPx(9.0), lmPx(18.0));
  // Íris: fibras radiais (ruído no círculo, mais fino perto da pupila) num anel em volta do buraco.
  vec2 dir = q / max(r, 1e-4);
  float fibers = 0.5 + 0.5 * (lmNoise(vec3(dir * 18.0, r * 6.0)) * 0.6 + lmNoise(vec3(dir * 60.0, r * 2.0 + 4.0)) * 0.4);
  // O anel nasce do escuro da pupila (sem aparecer de uma vez) e encosta no buraco, sem contorno preto.
  float ring = (1.0 - smoothstep(hole + 0.12, hole + 0.35, r)) * smoothstep(0.0, 0.25, e);
  vec3 irisLin = lmToLinear(iris) * (0.35 + fibers * 1.1) * (1.0 + 0.8 * (1.0 - smoothstep(hole, hole + 0.12, r)));
  vec3 col = irisLin * ring * mostrarIris;
  return mix(col, next, inside);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float e = smoothstep(0.0, 1.0, progress);
  vec3 col;
  if (e < 0.5) {
    float d = e * 2.0;
    // Obturador em unidades do mergulho: mais aberto onde a câmera anda mais rápido.
    float speed = 4.0 * d * (1.0 - d) + d;
    float shutter = 0.06 * desfoque * speed;
    float d0 = clamp(d - shutter, 0.0, 1.0);
    float d1 = d;
    vec2 eye = vec2(ponto.x, 1.0 - ponto.y);
    float scale = pow(profundidade, d);
    float px = (length((uv - mix(eye, vec2(0.5), smoothstep(0.0, 0.6, d))) * resolution) * log(profundidade) + length((vec2(0.5) - eye) * resolution)) * (d1 - d0);
    int n = int(clamp(ceil(px / 2.5), 1.0, 32.0));
    float lod = clamp(log2(max(px / float(n) / scale, 1.0)) - 1.0, 0.0, 5.0);
    float jitter = lmIGN(gl_FragCoord.xy);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      if (i >= n) break;
      sum += diveColor(uv, mix(d0, d1, tent((float(i) + jitter) / float(n))), lod);
    }
    col = sum / float(n);
    // A pupila: um disco escuro no centro que cresce no fim do mergulho.
    float r = length(lmCentered(uv));
    float pupil = smoothstep(0.55, 1.0, d) * 1.2;
    col *= smoothstep(pupil - 0.25, pupil, r);
  } else {
    col = openColor(uv, (e - 0.5) * 2.0);
  }
  return vec4(lmToSrgb(col), 1.0);
}
