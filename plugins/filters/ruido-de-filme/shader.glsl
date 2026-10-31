// P&B de película velha e muito usada (Tri-X puxada, cópia projetada mil vezes):
// - Exposição pancromática em luz linear, curva de papel firme e grão forte, trocado a cada quadro de 24 fps.
// - Riscos verticais de verdade: cada um nasce num quadro, dura de meio a dois segundos, deriva devagar de lado,
//   ondula um pouco e falha ao longo da altura; claros (emulsão arrancada) ou escuros (risco na base). Perfil
//   gaussiano de 1 a 2 px de 1080p: sem serrilhado.
// - Poeira e fiapos esparsos, com forma orgânica (borda deformada por ruído) e vida de um quadro só.
// - Leve oscilação de exposição de cópia gasta.

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

/** Riscos verticais: devolve (claro, escuro), 0 a 1. */
vec2 scratches(vec2 uv, float t) {
  vec2 result = vec2(0.0);
  float px = lmPx(1.0) / ratio; // 1 px de 1080p em uv de largura
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float life = mix(0.6, 2.2, lmHash(fi + 0.37));
    float age = t / life + lmHash(fi + 3.1);
    float seg = floor(age);
    vec3 h = lmHash3(vec2(seg, fi + 11.0));
    if (h.x > 0.55) continue; // nem todo trecho tem risco
    float local = fract(age);
    // Nasce e some em poucos quadros, não pisca.
    float fade = smoothstep(0.0, 0.06, local) * (1.0 - smoothstep(0.9, 1.0, local));
    float x = h.y + (local - 0.5) * (h.z - 0.5) * 0.04;
    if (abs(uv.x - x) > 0.004 + 3.0 * px) continue; // longe deste risco: nem calcula o resto
    x += lmNoise(vec2(uv.y * 2.5, seg * 3.7 + fi)) * 0.002;
    float width = mix(0.7, 1.8, lmHash(vec2(seg, fi + 5.0))) * px;
    float d = (uv.x - x) / width;
    float line = exp(-d * d);
    // Falhas ao longo da altura.
    float along = smoothstep(-0.25, 0.35, lmNoise(vec2(uv.y * 5.0 + seg * 1.7, fi * 7.0)));
    float strength = line * along * fade * mix(0.35, 0.8, lmHash(vec2(seg, fi + 9.0)));
    if (lmHash(vec2(seg, fi + 13.0)) < 0.7) result.x += strength; else result.y += strength;
  }
  return min(result, 1.0);
}

/** Poeira e fiapos de um quadro: devolve (claro, escuro). */
vec2 dust(vec2 uv, float frame) {
  vec2 p = lmCentered(uv) * 1080.0; // px de 1080p
  float cellSize = 180.0;
  vec2 result = vec2(0.0);
  // Só as 4 células mais próximas (cada mancha cabe em meia célula em volta do seu centro).
  vec2 cell = floor(p / cellSize - 0.5);
  float aa = 0.5 * 1080.0 / resolution.y;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 cid = cell + vec2(float(i), float(j));
      vec3 h = lmHash3(vec3(cid, frame));
      if (h.x > 0.06) continue;
      vec3 g = lmHash3(vec3(cid + 31.0, frame));
      vec2 center = (cid + 0.25 + 0.5 * g.xy) * cellSize;
      vec2 q = p - center;
      float sd;
      if (g.z < 0.7) {
        // Grão de poeira: mancha arredondada com borda irregular.
        float r = mix(1.5, 5.0, h.y);
        sd = length(q) - r * (1.0 + 0.45 * lmNoise(q / r * 1.3 + h.z * 40.0));
      } else {
        // Fiapo: curva fina e torta.
        float len = mix(14.0, 40.0, h.y);
        vec2 dir = vec2(cos(h.z * 6.283), sin(h.z * 6.283));
        vec2 nrm = vec2(-dir.y, dir.x);
        float s = dot(q, dir);
        float bend = lmNoise(vec2(s / len * 1.5, h.z * 50.0)) * len * 0.25;
        float across = dot(q, nrm) - bend;
        sd = max(abs(across) - 0.6, abs(s) - len * 0.5);
      }
      // Borda suavizada em 1 px da tela + 0,6 px de 1080p (sem derivadas: estamos dentro de um laço com saltos).
      float shape = 1.0 - smoothstep(-aa - 0.3, aa + 0.3, sd);
      if (lmHash(vec3(cid + 77.0, frame)) < 0.75) result.y += shape; else result.x += shape;
    }
  }
  return min(result, 1.0);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float frame = floor(time * 24.0);
  float y = dot(lmToLinear(c.rgb), vec3(0.25, 0.62, 0.13));
  y *= exp2((lmHash(frame + 0.25) - 0.5) * 0.12);
  float v = lmToSrgb(vec3(y)).x;
  float l = mix(0.02, 0.97, paperCurve(v, 5.4, 0.46));
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.85, 2.0, time));
  vec2 s = scratches(uv, time);
  vec2 d = dust(uv, frame);
  l = mix(l, 0.93, clamp(s.x + d.x, 0.0, 1.0) * 0.85);
  l = mix(l, 0.04, clamp(s.y + d.y, 0.0, 1.0) * 0.8);
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
