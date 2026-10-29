float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 0.71)), hash(vec2(i + 1.0, 0.71)), f);
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 30.0);
  // O sinal vai e volta: em alguns instantes quase some.
  float level = clamp(forca * (0.6 + 0.8 * vnoise(time * 2.3)), 0.0, 1.0);

  // Linhas balançando (o horizontal não segura) e rasgos de lado em faixas soltas.
  float wob = sin(uv.y * 7.0 + time * 2.1) * 0.004 + (vnoise(uv.y * 45.0 + time * 9.0) - 0.5) * 0.012;
  float strip = floor(uv.y * 50.0);
  float tear = step(0.975 - 0.04 * level, hash(vec2(strip, frame))) * (hash(vec2(frame, strip + 3.0)) - 0.5) * 0.1;
  vec2 u = vec2(uv.x + (wob * oscilacao + tear) * level, uv.y);

  vec3 col = getColor(u).rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), 0.65 * level);       // a cor é a primeira a sumir
  col = mix(col, vec3(0.42), 0.3 * level);      // contraste lavado, preto acinzentado

  // Chuvisco: pontinhos finos, levemente coloridos, mais fortes quando o sinal cai.
  vec2 px = floor(uv * resolution / 1.5);
  float n = hash(px + frame * 17.31);
  vec3 snow = mix(vec3(n), vec3(n, hash(px + frame * 3.1 + 1.7), hash(px + frame * 5.3 + 4.1)), 0.25);
  col = mix(col, snow, neve * level * (0.35 + 0.65 * vnoise(time * 3.7 + 5.0)));
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
