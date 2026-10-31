// Borboleta: o clipe se dobra ao meio como asas que se fecham para trás. Cada metade gira em volta da linha do
// centro (projeção em perspectiva de verdade, sem deformar a proporção) até ficar de perfil, escurecendo conforme
// vira de lado para a luz, e revela o próximo clipe, que sai da sombra e assenta. Dobra com aceleração cúbica e
// desfoque de movimento no tempo do obturador.

const float FOCAL = 1.6;

float angleAt(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)) * PI * 0.5; }

/** Asa do lado "side" (−1 esquerda, 1 direita) dobrada "a" para trás: (distância do centro, y, t). */
vec3 hitWing(vec2 s, float a, float side) {
  vec3 ro = vec3(0.0, 0.0, -FOCAL);
  vec3 rd = vec3(s, FOCAL);
  vec3 u = vec3(side * cos(a), 0.0, sin(a));
  vec3 n = vec3(side * sin(a), 0.0, -cos(a));
  float dn = dot(rd, n);
  float t = abs(dn) > 1e-6 ? dot(-ro, n) / dn : -1.0;
  vec3 h = ro + rd * t;
  return vec3(dot(h, u), h.y, t);
}

float panelSd(vec3 hit) { return lmSdBox(hit.xy - vec2(ratio * 0.25, 0.0), vec2(ratio * 0.25, 0.5)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 s = lmCentered(uv);
  float e = lmEaseInOutCubic(progress);
  float side = s.x < 0.0 ? -1.0 : 1.0;

  // O próximo clipe: sai da sombra e assenta (de 112% para 100%, sem nunca mostrar a borda).
  vec2 tuv = (uv - 0.5) / mix(1.12, 1.0, e) + 0.5;
  vec3 behind = lmToLinear(getToColor(tuv).rgb) * mix(0.2, 1.0, smoothstep(0.0, 0.95, e));

  // Tenda de 3% da transição ≈ obturador de 180° numa transição de 0,8 s a 30 quadros/s: rastro só onde anda
  // rápido, a imagem continua legível.
  const float shutter = 0.03;
  float a0 = angleAt(progress - shutter * 0.5);
  float a1 = angleAt(progress + shutter * 0.5);
  // Número fixo de instantes (fluxo uniforme): o antisserrilhado usa a derivada de cada instante.
  const int n = 16;
  float lod = clamp(log2(max(abs(a1 - a0) * ratio * 0.5 * resolution.y / float(n), 1.0)) - 1.0, 0.0, 2.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < n; i++) {
    // A largura do antisserrilhado vem do instante sem ruído (igual nos pixels vizinhos).
    float w = clamp(fwidth(panelSd(hitWing(s, mix(a0, a1, tent((float(i) + 0.5) / float(n))), side))), 1e-5, 0.02);
    float a = mix(a0, a1, tent((float(i) + jitter) / float(n)));
    vec3 hit = hitWing(s, a, side);
    float cover = hit.z > 0.0 ? clamp(0.5 - panelSd(hit) / w, 0.0, 1.0) : 0.0;
    vec3 col = behind * (1.0 - cover);
    if (cover > 0.0) {
      vec3 tex = lmToLinear(getFromColorLod(clamp(vec2(0.5 + side * hit.x / ratio, hit.y + 0.5), 0.0, 1.0), lod).rgb);
      col += cover * tex * mix(0.12, 1.0, pow(cos(a), 1.2));
    }
    sum += col;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
