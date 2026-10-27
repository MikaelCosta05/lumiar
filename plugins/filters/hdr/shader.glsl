float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2(3.0 * k) / resolution;
  vec3 blur = (getColor(uv + vec2(px.x, 0.0)).rgb + getColor(uv - vec2(px.x, 0.0)).rgb
  + getColor(uv + vec2(0.0, px.y)).rgb + getColor(uv - vec2(0.0, px.y)).rgb
  + getColor(uv + px).rgb + getColor(uv - px).rgb
  + getColor(uv + vec2(px.x, -px.y)).rgb + getColor(uv + vec2(-px.x, px.y)).rgb) / 8.0;
  vec3 col = c.rgb + (c.rgb - blur) * 2.0;
  col = mix(vec3(luma(col)), col, 1.15);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
