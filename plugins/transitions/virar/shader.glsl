// Virar cartão: o clipe é um cartão que gira 180° em volta do eixo vertical e mostra o próximo no verso.
// Projeção em perspectiva de verdade (raio da câmera contra o plano do cartão, sem deformar a proporção), a
// câmera recua no meio do giro para o cartão caber no quadro, o lado escurece conforme fica de perfil para a luz
// (que vem da câmera) e o giro tem desfoque de movimento integrado no tempo do obturador.

const float FOCAL = 1.6;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

float angleAt(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)) * PI; }

/** (x, y) no cartão girado de "a" e a distância do raio (negativa = não acerta). */
vec3 hitCard(vec2 s, float a) {
  vec3 ro = vec3(0.0, 0.0, -FOCAL - 0.8 * sin(a));
  vec3 rd = vec3(s, FOCAL);
  vec3 u = rotY(vec3(1.0, 0.0, 0.0), a);
  vec3 n = rotY(vec3(0.0, 0.0, -1.0), a);
  float dn = dot(rd, n);
  float t = abs(dn) > 1e-6 ? dot(-ro, n) / dn : -1.0;
  vec3 h = ro + rd * t;
  return vec3(dot(h, u), h.y, t);
}

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 s = lmCentered(uv);
  vec2 half_ = vec2(ratio * 0.5, 0.5);

  // Tenda de 3% da transição ≈ obturador de 180° numa transição de 0,8 s a 30 quadros/s: rastro só onde anda
  // rápido, a imagem continua legível.
  const float shutter = 0.03;
  float a0 = angleAt(progress - shutter * 0.5);
  float a1 = angleAt(progress + shutter * 0.5);
  // Número fixo de instantes (fluxo uniforme): o antisserrilhado usa a derivada de cada instante, certa até de perfil.
  const int n = 16;
  float lod = clamp(log2(max(abs(a1 - a0) * ratio * 0.5 * resolution.y / float(n), 1.0)) - 1.0, 0.0, 2.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 bg = vec3(0.004);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < n; i++) {
    // A largura do antisserrilhado vem do instante sem ruído (igual nos pixels vizinhos).
    float w = clamp(fwidth(lmSdBox(hitCard(s, mix(a0, a1, tent((float(i) + 0.5) / float(n)))).xy, half_)), 1e-5, 0.02);
    float a = mix(a0, a1, tent((float(i) + jitter) / float(n)));
    vec3 hit = hitCard(s, a);
    float cover = hit.z > 0.0 ? clamp(0.5 - lmSdBox(hit.xy, half_) / w, 0.0, 1.0) : 0.0;
    vec3 col = bg * (1.0 - cover);
    if (cover > 0.0) {
      float facing = cos(a);
      vec2 tuv = hit.xy / vec2(ratio, 1.0) + 0.5;
      // Frente: clipe atual; verso: o próximo (espelhado de volta, para ler certo).
      vec3 tex = facing > 0.0 ? lmToLinear(getFromColorLod(clamp(tuv, 0.0, 1.0), lod).rgb) : lmToLinear(getToColorLod(clamp(vec2(1.0 - tuv.x, tuv.y), 0.0, 1.0), lod).rgb);
      col += cover * tex * mix(0.12, 1.0, pow(abs(facing), 1.2));
    }
    sum += col;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
