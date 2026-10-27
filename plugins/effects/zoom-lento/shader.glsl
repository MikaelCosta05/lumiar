vec4 effect(vec2 uv) {
  float k = smoothstep(0.0, 1.0, clamp(time / max(duration, 0.001), 0.0, 1.0));
  float zoom = mix(zoomStart, zoomEnd, k);
  return getColor((uv - center) / zoom + center);
}
