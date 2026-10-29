float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 rainbow(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 30.0);
  vec2 u = uv;
  float crease = 0.0;

  // Dois amassados possíveis por vez, cada um num trecho de ~0,7 s, em lugar sorteado.
  for (int i = 0; i < 2; i++) {
    float slot = floor(time * 1.4 + float(i) * 0.5);
    float seed = slot * 3.17 + float(i) * 11.3;
    if (hash(vec2(seed, 1.0)) > amassados) continue;
    float life = fract(time * 1.4 + float(i) * 0.5);
    float y0 = hash(vec2(seed, 2.0)) - life * 0.08;
    float hh = (0.015 + 0.06 * hash(vec2(seed, 3.0))) * tamanho * 2.0;
    float d = (uv.y - y0) / hh;
    if (abs(d) < 1.0) {
      float w = 1.0 - d * d;
      // A imagem dentro do amassado é espremida para o meio e puxada de lado.
      u.y = y0 + (uv.y - y0) * (1.0 - 0.7 * w);
      u.x += (hash(vec2(floor(uv.y * 240.0), frame)) - 0.5) * 0.03 * w + 0.012 * w;
      crease = max(crease, w * sin(life * PI));
    }
  }

  vec3 col = getColor(u).rgb;
  if (crease > 0.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 tint = rainbow(fract(uv.x * 3.0 + uv.y * 20.0 + time));
    col = mix(col, mix(vec3(l), tint, 0.6) * (0.6 + 0.6 * l), crease * 0.8);
    col *= 1.0 - 0.25 * crease * step(0.5, hash(vec2(floor(uv.y * 480.0), frame)));
  }

  // Dropouts: riscos curtos onde a fita perdeu o óxido (brancos, às vezes pretos).
  float row = floor(uv.y * 300.0);
  float on = step(1.0 - dropouts * 0.06, hash(vec2(row, frame)));
  float x0 = hash(vec2(row, frame + 1.7));
  float len = 0.02 + 0.12 * hash(vec2(row, frame + 4.2));
  float inside = step(x0, uv.x) * step(uv.x, x0 + len);
  float fade = 1.0 - (uv.x - x0) / len;
  float white = step(0.25, hash(vec2(row, frame + 8.8)));
  col = mix(col, vec3(white * 0.95), on * inside * (0.5 + 0.5 * fade));
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
