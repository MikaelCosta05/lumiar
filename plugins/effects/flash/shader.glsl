vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // As partes claras chegam na cor antes das escuras: parece luz estourando, não uma tinta por cima.
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float k = clamp(amount * (1.0 + glow * (lum - 0.5) * 1.6), 0.0, 1.0);
  k = mix(k, amount, step(0.999, amount));
  return vec4(mix(c.rgb, tint, k), c.a);
}
