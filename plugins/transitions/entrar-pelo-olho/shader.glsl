float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

/** Primeira metade: o clipe atual com zoom no olho (que vai para o centro) e a pupila fechando a tela. */
vec3 dive(vec2 uv, float e) {
  vec2 eye = vec2(ponto.x, 1.0 - ponto.y);
  float scale = pow(profundidade, e);
  vec2 view = mix(eye, vec2(0.5), smoothstep(0.0, 0.6, e));
  vec2 a = eye + (uv - view) / scale;
  vec3 col = getFromColor(clamp(a, 0.0, 1.0)).rgb;
  // A pupila: um disco escuro no centro que cresce no fim do mergulho.
  float r = length((uv - 0.5) * vec2(ratio, 1.0));
  float pupil = smoothstep(0.55, 1.0, e) * 1.2;
  return col * smoothstep(pupil - 0.25, pupil, r);
}

/** Segunda metade: o próximo clipe aparece num círculo que abre do centro, com a íris em volta. */
vec3 open(vec2 uv, float e) {
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  float r = length(q);
  float hole = e * e * 1.2;
  // Recua de leve enquanto abre: a câmera sai de dentro do olho.
  float scale = mix(1.6, 1.0, e);
  vec3 next = getToColor(0.5 + (uv - 0.5) / scale).rgb;
  float inside = 1.0 - smoothstep(hole - 0.03, hole, r);
  // Íris: fibras saindo do centro, mais claras perto da pupila, num anel em volta do buraco.
  float ang = atan(q.y, q.x);
  float fibers = vnoise(vec2(ang * 18.0, r * 6.0)) * 0.6 + vnoise(vec2(ang * 60.0, r * 2.0)) * 0.4;
  float ring = smoothstep(hole, hole + 0.02, r) * (1.0 - smoothstep(hole + 0.12, hole + 0.35, r));
  vec3 irisCol = iris * (0.5 + fibers * 0.9) * (1.0 + 0.6 * (1.0 - smoothstep(hole, hole + 0.12, r)));
  vec3 col = irisCol * ring * mostrarIris;
  return mix(col, next, inside);
}

vec4 transition(vec2 uv) {
  float e = smoothstep(0.0, 1.0, progress);
  vec3 col;
  if (e < 0.5) {
    float d = e * 2.0;
    float speed = 4.0 * d * (1.0 - d) + d;
    // Desfoque de movimento: média de instantes vizinhos do mergulho.
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float k = float(i) / 7.0;
      sum += dive(uv, clamp(d - k * 0.04 * desfoque * speed, 0.0, 1.0));
    }
    col = sum / 8.0;
  } else {
    col = open(uv, (e - 0.5) * 2.0);
  }
  return vec4(col, 1.0);
}
