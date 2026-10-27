vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

vec3 saturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

vec3 splitTone(vec3 c, vec3 shadows, vec3 highlights, float amount) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c + (mix(shadows, highlights, smoothstep(0.0, 1.0, l)) - 0.5) * amount;
}

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

/** Brilho suave em volta das partes claras (amostras em círculo). */
vec3 bloom(vec2 uv, float radiusPx, float threshold) {
  float k = resolution.y / 720.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec3 s = getColor(uv + vec2(cos(a), sin(a)) * radiusPx * k / resolution).rgb;
    glow += s * smoothstep(threshold, 1.0, dot(s, vec3(0.333)));
  }
  return glow / 12.0;
}

/** Média dos vizinhos (para nitidez/clareza). */
vec3 blurCross(vec2 uv, float radiusPx) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(radiusPx * k) / resolution;
  return (getColor(uv + vec2(px.x, 0.0)).rgb + getColor(uv - vec2(px.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, px.y)).rgb + getColor(uv - vec2(0.0, px.y)).rgb
    + getColor(uv + px).rgb + getColor(uv - px).rgb
    + getColor(uv + vec2(px.x, -px.y)).rgb + getColor(uv + vec2(-px.x, px.y)).rgb) / 8.0;
}

/** Desfoque que respeita bordas (alisa pele e ruído sem borrar contornos). */
vec3 smoothSkin(vec2 uv, vec3 center, float sharpness) {
  float k = resolution.y / 720.0;
  vec3 sum = center;
  float wsum = 1.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      if (i == 0 && j == 0) continue;
      vec3 s = getColor(uv + vec2(float(i), float(j)) * 1.5 * k / resolution).rgb;
      vec3 d = s - center;
      float w = exp(-dot(d, d) * sharpness);
      sum += s * w;
      wsum += w;
    }
  }
  return sum / wsum;
}

/** Vibração: realça mais as cores apagadas do que as já fortes. */
vec3 vibrance(vec3 c, float amount) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  return saturate(c, 1.0 + amount * (1.0 - (mx - mn)));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb * 0.92 + 0.07 + bloom(uv, 14.0, 0.45) * 0.55;
  col = saturate(col, 1.05) * vec3(1.02, 1.0, 0.99);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
