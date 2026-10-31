// Relógio do player: em que instante da timeline o preview está a cada quadro.

/**
 * Instante da timeline no quadro de horário `now` (ms, o que o requestAnimationFrame entrega), tocando desde
 * `timeAtStart` (s) a partir do horário `clockStart` (ms) na velocidade `rate`.
 * O horário do quadro pode ser um pouco anterior ao clique que deu o play: sem o Math.max, começando do zero
 * o tempo dava negativo e o player parava na hora (às vezes o play não tocava).
 */
export function playheadAt(timeAtStart: number, clockStart: number, now: number, rate: number): number {
  return timeAtStart + (Math.max(0, now - clockStart) / 1000) * rate;
}

/** O quadro em `t` já passou do fim: para a frente é a duração; para trás (rate < 0), o zero. */
export function reachedEnd(t: number, duration: number, rate: number): boolean {
  return t >= duration || (rate < 0 && t <= 0);
}
