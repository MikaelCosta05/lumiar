import type { BrandKit } from './brand';
import type { Caption, CaptionTrack } from './captions';
import type { Project } from './model';
import { createTextClip, findTextPreset, placeTextClip, removeTextClip, type TextClip } from './text';

/**
 * Nome na tela automático: depois de "Separar as vozes", cada pessoa ganha uma faixa de nome (o
 * texto "Faixa de nome", no terço de baixo) na primeira vez que fala. Usa o Kit da marca, se houver.
 */

export interface FirstAppearance {
  speaker: number;
  /** Quando a faixa aparece e some (s, tempo da timeline) */
  start: number;
  end: number;
}

/** Duas faixas nunca ficam juntas na tela; cada uma fica pelo menos isso. */
const MIN_SHOW = 1.5;

/**
 * A primeira fala de cada pessoa e quanto tempo o nome fica na tela: `duration` segundos, sem encostar
 * na faixa da próxima pessoa (aí sai um pouco antes, mas fica pelo menos 1,5 s).
 */
export function firstAppearances(captions: Caption[], duration = 4): FirstAppearance[] {
  const sorted = [...captions].filter((c) => c.speaker !== undefined && c.speaker >= 0).sort((a, b) => a.start - b.start);
  const seen = new Set<number>();
  const list: FirstAppearance[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const speaker = sorted[i].speaker!;
    if (seen.has(speaker)) continue;
    seen.add(speaker);
    const start = sorted[i].start;
    list.push({ speaker, start, end: start + Math.max(MIN_SHOW, duration) });
  }
  // A faixa de uma pessoa sai antes da próxima entrar; se ficar curta demais, a próxima espera um pouco.
  for (let k = 1; k < list.length; k++) {
    const prev = list[k - 1];
    const cur = list[k];
    if (cur.start < prev.end + 0.1) {
      prev.end = Math.max(prev.start + MIN_SHOW, cur.start - 0.1);
      if (cur.start < prev.end + 0.1) {
        const shift = prev.end + 0.1 - cur.start;
        cur.start += shift;
        cur.end += shift;
      }
    }
  }
  return list;
}

export interface SpeakerLabel {
  name: string;
  /** Segunda linha opcional (cargo, @perfil…) */
  role?: string;
}

/** A faixa de nome de uma pessoa, no estilo "Faixa de nome" (com as cores e a fonte da marca, se houver). */
export function nameClip(label: SpeakerLabel, start: number, end: number, project: Pick<Project, 'width' | 'height'>, brand: BrandKit | null): TextClip {
  const preset = findTextPreset('faixa')!;
  const text = label.role?.trim() ? `${label.name.trim()}\n${label.role.trim()}` : label.name.trim();
  const clip = createTextClip(preset, start, Math.max(0.5, end - start));
  clip.text = text;
  if (brand) clip.style = { ...clip.style, font: brand.titleFont, color: brand.colors[0], boxColor: brand.colors[1] };
  // A faixa começa perto da margem esquerda em qualquer formato de tela (o x é o centro do texto).
  const longest = Math.max(...text.split('\n').map((l) => l.length));
  const width = (longest * 0.6 * clip.style.size * project.height) / project.width;
  clip.x = Math.min(0.5, 0.06 + width / 2);
  return clip;
}

/**
 * Cria as faixas de nome. `labels[i]` é o nome da pessoa i (vazio = sem faixa). Faixas que o Lumiar
 * já tinha posto (mesmo instante e mesmo nome de antes) são trocadas, para poder rodar de novo.
 */
export function addSpeakerNames(
  project: Project,
  track: CaptionTrack,
  labels: SpeakerLabel[],
  duration: number,
  brand: BrandKit | null,
): { project: Project; count: number } {
  const appearances = firstAppearances(track.captions, duration);
  let p = project;
  // Tira as faixas de uma rodada anterior: texto com o nome (antigo ou novo) da pessoa, perto da primeira fala dela.
  const firsts = new Map<number, number>();
  for (const c of track.captions) {
    if (c.speaker === undefined) continue;
    const before = firsts.get(c.speaker);
    if (before === undefined || c.start < before) firsts.set(c.speaker, c.start);
  }
  const stale = p.textTracks.flatMap((tr) =>
    tr.clips.filter((c) =>
      [...firsts].some(([speaker, start]) => {
        const names = [track.speakers?.[speaker]?.name, labels[speaker]?.name].map((n) => n?.trim()).filter(Boolean);
        return Math.abs(c.start - start) < 3 && names.includes(c.text.split('\n')[0].trim());
      }),
    ),
  );
  for (const c of stale) p = removeTextClip(p, c.id);
  // Abaixo da legenda? Se a legenda fica embaixo, a faixa sobe um pouco para não ficar por cima dela.
  const captionsLow = track.enabled !== false && track.captions.length > 0 && track.style.y > 0.7;
  let count = 0;
  for (const a of appearances) {
    const label = labels[a.speaker];
    if (!label?.name.trim()) continue;
    const clip = nameClip(label, a.start, a.end, p, brand);
    if (captionsLow) clip.y = Math.min(clip.y, track.style.y - 0.16);
    p = placeTextClip(p, clip);
    count++;
  }
  return { project: p, count };
}
