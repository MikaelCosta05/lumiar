// Rabiscos animados: traço de caneta em volta da pessoa, tremendo como animação feita à mão (um desenho novo
// "quadros" vezes por segundo), com estrelinhas, corações, brilhos e bolinhas em volta.
// - A distância até a pessoa sai da máscara borrada (gaussiana com 48 amostras fixas, invertida pela aproximação
//   logística): o traço é contínuo e liso, sem os degraus da busca em anéis.
// - O tremor e as falhas do traço são ruído de gradiente suave sorteado de novo a cada desenho.
// - Os desenhos são formas por distância com a borda antisserrilhada pela derivada do pixel.
// Tamanhos em px de 1080p.
const int TAPS = 48;

float personBlur(vec2 uv, float sigmaPx) {
  vec2 toUv = vec2(1.0 / ratio, 1.0) / 1080.0;
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float r = sqrt((float(i) + 0.5) / float(TAPS)) * 2.5;
    float a = float(i) * 2.39996323;
    float w = exp(-0.5 * r * r);
    sum += getPerson(uv + vec2(cos(a), sin(a)) * r * sigmaPx * toUv) * w;
    wsum += w;
  }
  return sum / wsum;
}

float dot2(vec2 v) { return dot(v, v); }

// Desenhos de caderno (distância até a borda; negativa dentro), num espaço de -1 a 1.
float star(vec2 p) {
  float ang = atan(p.x, p.y);
  float k = cos(floor(0.5 + ang / 1.2566) * 1.2566 - ang);
  return length(p) * k - mix(0.32, 0.75, pow(abs(cos(ang * 2.5)), 6.0));
}

float heart(vec2 p) {
  p = p * 1.3 + vec2(0.0, 0.6);
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return (sqrt(dot2(p - vec2(0.25, 0.75))) - 0.3536) / 1.3;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y) / 1.3;
}

float spark(vec2 p) { return (sqrt(abs(p.x)) + sqrt(abs(p.y)) - 0.85) * 0.5; }

float ring(vec2 p) { return abs(length(p) - 0.45) - 0.02; }

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float frame = floor(time * quadros);
  float aa = 0.75 * 1080.0 / resolution.y;          // um pixel da tela, em px de 1080p
  vec3 col = base.rgb;

  // Contorno que "ferve": a cada desenho novo o traço treme de outro jeito e tem outras falhas.
  vec2 a = lmCentered(uv);
  vec2 jitter = vec2(lmNoise(vec3(a * 9.0, frame * 1.7)), lmNoise(vec3(a * 9.0 + 5.0, frame * 2.3))) * tremor * 0.012;
  vec2 j = uv + jitter / vec2(ratio, 1.0);
  float offset = (2.0 + distancia * 22.0) * 1.5;
  float width = (1.2 + espessura * 4.5) * 1.5 * (0.75 + 0.5 * (lmNoise(vec3(a * 25.0, frame)) * 0.5 + 0.5));
  float sigma = max((offset + width) * 0.55, 3.0);
  float m = personBlur(j, sigma);
  if (m > 1e-4) {
    float mm = clamp(m, 1e-4, 1.0 - 1e-4);
    float d = sigma * log((1.0 - mm) / mm) / 1.702;
    float line = 1.0 - smoothstep(width * 0.5 - aa, width * 0.5 + aa, abs(d - offset));
    line *= smoothstep(-0.55, -0.4, lmNoise(vec3(a * 12.0, frame * 3.1)));   // falhas da caneta
    col = mix(col, cor, line);
  }

  // Estrelas, corações, brilhos e bolinhas em volta da pessoa, cada um na sua casinha da grade.
  vec2 grid = vec2(ratio, 1.0) * 7.0;
  vec2 cell = floor(uv * grid);
  if (lmHash(cell + 3.1) < desenhos) {
    vec2 cc = (cell + 0.5) / grid;
    float near = 0.0;
    for (int i = 0; i < 8; i++) {
      float an = float(i) * 0.7854;
      near = max(near, getPerson(cc + vec2(cos(an) / ratio, sin(an)) * 0.1));
    }
    if (getPerson(cc) < 0.3 && near > 0.5) {
      vec2 local = fract(uv * grid) * 2.0 - 1.0;
      local += (vec2(lmHash(cell + frame), lmHash(cell - frame + 0.5)) - 0.5) * 0.2 * tremor;
      float rot = (lmHash(cell + frame * 0.37) - 0.5) * 0.5 * tremor + (lmHash(cell) - 0.5);
      local = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * local * 1.25;
      float kind = lmHash(cell + 9.0);
      float sd = kind < 0.35 ? star(local) : kind < 0.6 ? heart(local) : kind < 0.85 ? spark(local) : ring(local);
      float w = max(fwidth(sd), 1e-4);
      float stroke = 1.0 - smoothstep(0.05 - w, 0.05 + w, abs(sd));
      if (kind >= 0.6 && kind < 0.85) stroke = 1.0 - smoothstep(-w, w, sd);
      col = mix(col, cor2, stroke);
    }
  }
  return vec4(col, base.a);
}
