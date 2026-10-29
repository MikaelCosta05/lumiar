float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 r = vec2(1.5 * k) / resolution;
  vec3 b = (getColor(uv + vec2(r.x, 0.0)).rgb + getColor(uv - vec2(r.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, r.y)).rgb + getColor(uv - vec2(0.0, r.y)).rgb) * 0.25;
  // Nitidez demais: contorno claro em volta de tudo.
  vec3 col = c.rgb + (c.rgb - b) * sharp * 2.2;
  // A cor vem de blocos de 8 px (compressão), o claro e escuro continua do pixel.
  vec2 cell = vec2(8.0 * k);
  vec3 bc = getColor((floor(uv * resolution / cell) + 0.5) * cell / resolution).rgb;
  col = mix(col, vec3(luma(col)) + (bc - luma(bc)), blocks * 0.8);
  col = col * 1.12 - 0.02;
  col = saturate(col, 1.12);
  col += mix(vec3(0.015, -0.005, 0.03), vec3(-0.01, 0.0, 0.02), luma(col));
  col = floor(clamp(col, 0.0, 1.0) * 64.0 + 0.5) / 64.0;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
