float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float distanceToPerson(vec2 uv, float range) {
  if (getPerson(uv) > 0.5) return 0.0;
  for (int k = 1; k <= 10; k++) {
    float r = range * float(k) / 10.0;
    for (int i = 0; i < 14; i++) {
      float a = (float(i) + float(k) * 0.41) * 0.4488;
      if (getPerson(uv + vec2(cos(a), sin(a)) * r / resolution) > 0.5) return r;
    }
  }
  return range * 2.0;
}

float dot2(vec2 v) {
  return dot(v, v);
}

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

float spark(vec2 p) {
  return (sqrt(abs(p.x)) + sqrt(abs(p.y)) - 0.85) * 0.5;
}

float ring(vec2 p) {
  return abs(length(p) - 0.45) - 0.02;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float frame = floor(time * quadros);
  float px = resolution.y / 720.0;

  // Contorno que "ferve": a cada desenho novo, o traço treme de outro jeito e tem falhas.
  vec2 jitter = (vec2(vnoise(uv * 9.0 + frame * 1.7), vnoise(uv * 9.0 - frame * 2.3 + 5.0)) - 0.5) * tremor * 0.014;
  vec2 j = uv + jitter;
  float offset = (2.0 + distancia * 22.0) * px;
  float width = (1.2 + espessura * 4.5) * px * (0.7 + 0.6 * vnoise(uv * 25.0 + frame));
  float d = distanceToPerson(j, offset + width + 4.0 * px);
  float line = 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.2 * px, abs(d - offset));
  line *= step(0.14, vnoise(uv * 12.0 + frame * 3.1));
  vec3 col = mix(base.rgb, cor, line);

  // Estrelas, corações, brilhos e bolinhas em volta da pessoa, cada um na sua casinha da grade.
  vec2 grid = vec2(ratio, 1.0) * 7.0;
  vec2 cell = floor(uv * grid);
  if (hash(cell + 3.1) < desenhos) {
    vec2 cc = (cell + 0.5) / grid;
    float near = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      near = max(near, getPerson(cc + vec2(cos(a) / ratio, sin(a)) * 0.1));
    }
    if (getPerson(cc) < 0.3 && near > 0.5) {
      vec2 local = fract(uv * grid) * 2.0 - 1.0;
      local += (vec2(hash(cell + frame), hash(cell - frame)) - 0.5) * 0.2 * tremor;
      float rot = (hash(cell + frame * 0.37) - 0.5) * 0.5 * tremor + (hash(cell) - 0.5);
      local = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * local * 1.25;
      float kind = hash(cell + 9.0);
      float sd = kind < 0.35 ? star(local) : kind < 0.6 ? heart(local) : kind < 0.85 ? spark(local) : ring(local);
      float stroke = 1.0 - smoothstep(0.05, 0.1, abs(sd));
      if (kind >= 0.6 && kind < 0.85) stroke = 1.0 - smoothstep(-0.02, 0.02, sd);
      col = mix(col, cor2, stroke);
    }
  }
  return vec4(col, base.a);
}
