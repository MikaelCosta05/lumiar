// Cubo 3D: os dois clipes são faces de uma caixa (largura e profundidade = largura da tela, altura = altura da
// tela, então nenhuma face deforma) que gira 90° em volta do eixo vertical. Projeção em perspectiva de verdade
// (raio da câmera contra o plano de cada face), a câmera recua no meio do giro para a caixa caber no quadro, cada
// face escurece conforme se afasta da luz (que vem da câmera) e o giro tem desfoque de movimento integrado no
// tempo do obturador. Bordas das faces antisserrilhadas.

const float FOCAL = 1.6;  // distância da câmera à tela (altura da tela = 1): ~34° de campo vertical

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

/**
 * Ponto do plano (origem p0, eixos u e v) atingido pelo raio: (x, y) no plano e t (distância). cross(u, v) aponta
 * para dentro da caixa: só vale quando o raio chega pelo lado de fora (t negativo = a face está de costas).
 */
vec3 hitPlane(vec3 ro, vec3 rd, vec3 p0, vec3 u, vec3 v) {
  vec3 n = cross(u, v);
  float dn = dot(rd, n);
  float t = dn > 1e-6 ? dot(p0 - ro, n) / dn : -1.0;
  vec3 h = ro + rd * t - p0;
  return vec3(dot(h, u), dot(h, v), t);
}

float angleAt(float t) { return lmEaseInOutCubic(clamp(t, 0.0, 1.0)) * PI * 0.5; }

struct Faces { vec3 front; vec3 side; float frontFacing; float sideFacing; };

Faces faces(vec2 s, float phi) {
  float pull = 0.55 * sin(2.0 * phi);
  vec3 ro = vec3(0.0, 0.0, -FOCAL - pull);
  vec3 rd = vec3(s, FOCAL);
  float h = ratio * 0.5;
  vec3 center = vec3(0.0, 0.0, h);
  Faces f;
  // Face da frente (clipe atual) e face da direita (próximo), que vem para a frente.
  f.front = hitPlane(ro, rd, center + rotY(vec3(0.0, 0.0, -h), phi), rotY(vec3(1.0, 0.0, 0.0), phi), vec3(0.0, 1.0, 0.0));
  f.side = hitPlane(ro, rd, center + rotY(vec3(h, 0.0, 0.0), phi), rotY(vec3(0.0, 0.0, 1.0), phi), vec3(0.0, 1.0, 0.0));
  f.frontFacing = cos(phi);  // −z da normal (luz e câmera na frente)
  f.sideFacing = sin(phi);
  return f;
}

vec3 shade(vec3 lin, float facing) { return lin * mix(0.16, 1.0, pow(max(facing, 0.0), 1.2)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 s = lmCentered(uv);
  vec2 half_ = vec2(ratio * 0.5, 0.5);

  // Obturador de ~180° num giro de ~1 s a 30 quadros/s (1/60 da transição): rastro moderado e só onde a face
  // anda rápido; as faces continuam legíveis e as arestas retas.
  const float shutter = 0.017;
  float a0 = angleAt(progress - shutter * 0.5);
  float a1 = angleAt(progress + shutter * 0.5);
  // Número fixo de instantes (fluxo uniforme): o antisserrilhado usa a derivada de cada instante.
  const int n = 16;
  // Nível de detalhe só para tirar o chuvisco entre instantes (o rastro vem das amostras, não de borrar tudo).
  float lod = clamp(log2(max(abs(a1 - a0) * ratio * 0.5 * resolution.y / float(n), 1.0)) - 1.5, 0.0, 1.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 bg = vec3(0.004);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < n; i++) {
    // A largura do antisserrilhado vem do instante sem ruído (igual nos pixels vizinhos); a amostra, do instante
    // com ruído intercalado (o rastro fica liso).
    Faces r = faces(s, mix(a0, a1, tent((float(i) + 0.5) / float(n))));
    float wf = clamp(fwidth(lmSdBox(r.front.xy, half_)), 1e-5, 0.02);
    float ws = clamp(fwidth(lmSdBox(r.side.xy, half_)), 1e-5, 0.02);
    float phi = mix(a0, a1, tent((float(i) + jitter) / float(n)));
    Faces f = faces(s, phi);
    float cf = clamp(0.5 - lmSdBox(f.front.xy, half_) / wf, 0.0, 1.0);
    float cs = clamp(0.5 - lmSdBox(f.side.xy, half_) / ws, 0.0, 1.0);
    cf = f.front.z > 0.0 ? cf : 0.0;
    cs = f.side.z > 0.0 ? cs : 0.0;
    vec3 col = bg * max(1.0 - cf - cs, 0.0);
    if (cf > 0.0) col += cf * shade(lmToLinear(getFromColorLod(clamp(f.front.xy / vec2(ratio, 1.0) + 0.5, 0.0, 1.0), lod).rgb), f.frontFacing);
    if (cs > 0.0) col += cs * shade(lmToLinear(getToColorLod(clamp(f.side.xy / vec2(ratio, 1.0) + 0.5, 0.0, 1.0), lod).rgb), f.sideFacing);
    sum += col;
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
