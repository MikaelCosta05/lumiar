// Portas: o clipe se divide ao meio em duas portas presas nas bordas da tela, que se abrem em direção à câmera
// (projeção em perspectiva de verdade: a borda livre cresce ao chegar perto e sai do quadro), escurecendo
// conforme viram de lado para a luz. Atrás delas o próximo clipe sai da sombra e se aproxima um pouco (a câmera
// passa pela porta). Abertura com aceleração cúbica e desfoque de movimento no tempo do obturador.

const float FOCAL = 1.6;

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

float angleAt(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)) * radians(80.0); }

/** Porta presa em x = side·ratio/2 (side = −1 esquerda, 1 direita) aberta "a": (distância da dobra, y, t). */
vec3 hitDoor(vec2 s, float a, float side) {
  vec3 ro = vec3(0.0, 0.0, -FOCAL);
  vec3 rd = vec3(s, FOCAL);
  vec3 hinge = vec3(side * ratio * 0.5, 0.0, 0.0);
  vec3 u = vec3(-side * cos(a), 0.0, -sin(a));  // da dobra para a borda livre, vindo em direção à câmera
  vec3 n = vec3(side * sin(a), 0.0, -cos(a));
  float dn = dot(rd, n);
  float t = abs(dn) > 1e-6 ? dot(hinge - ro, n) / dn : -1.0;
  vec3 h = ro + rd * t - hinge;
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

  // O próximo clipe atrás das portas: sai da sombra e chega perto (espelhado além da borda, que as portas cobrem).
  vec2 tuv = (uv - 0.5) / mix(0.94, 1.0, e) + 0.5;
  vec3 behind = lmToLinear(getToColor(mirrorUv(tuv)).rgb) * mix(0.25, 1.0, smoothstep(0.0, 0.9, e));

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
    float w = clamp(fwidth(panelSd(hitDoor(s, mix(a0, a1, tent((float(i) + 0.5) / float(n))), side))), 1e-5, 0.02);
    float a = mix(a0, a1, tent((float(i) + jitter) / float(n)));
    vec3 hit = hitDoor(s, a, side);
    float cover = hit.z > 0.0 ? clamp(0.5 - panelSd(hit) / w, 0.0, 1.0) : 0.0;
    vec3 col = behind * (1.0 - cover);
    if (cover > 0.0) {
      float x = side < 0.0 ? hit.x / ratio : 1.0 - hit.x / ratio;
      vec3 tex = lmToLinear(getFromColorLod(clamp(vec2(x, hit.y + 0.5), 0.0, 1.0), lod).rgb);
      col += cover * tex * mix(0.15, 1.0, pow(cos(a), 1.2));
    }
    sum += col;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
