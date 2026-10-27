export function hexToRgb(hex: string): number[] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255);
}

export function rgbToHex(rgb: number[]): string {
  return (
    '#' +
    rgb
      .slice(0, 3)
      .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}
