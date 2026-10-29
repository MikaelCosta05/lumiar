import { assetUrl } from '../assetUrl';
import { t } from '../i18n';
import { createCamera } from './camera';
import {
  addMarker,
  createEffect,
  createFilter,
  createProject,
  createTransition,
  createVideoClip,
  insertVideoClips,
  layoutProject,
  uid,
  updateMarker,
  type MediaItem,
  type Project,
  type TimelineComment,
  type VideoClip,
} from './model';
import { PACKS } from './packLibrary';
import { applyPack } from './packs';
import { createTextClip, placeTextClip, TEXT_PRESETS } from './text';

/**
 * Projeto de exemplo: uns 24 s montados com as fotos e o vídeo CC0 das prévias (public/previews), com
 * filtros, transições, um título, um pacote de edição, marcadores e comentários com dicas. Serve para
 * quem abre o Lumiar pela primeira vez ver tudo funcionando antes de importar as próprias mídias.
 */

/** Guardado neste computador: o convite para abrir o exemplo já apareceu (e a pessoa abriu, dispensou ou já começou a editar). */
const OFFERED_KEY = 'lumiar:exemplo-oferecido';

export function sampleOffered(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) === '1';
  } catch {
    // Sem armazenamento: o convite aparece de novo na próxima vez, sem problema.
    return false;
  }
}

export function markSampleOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, '1');
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
}

/** As mídias do exemplo, na ordem em que entram. */
export const SAMPLE_FILES = [
  { key: 'landscape', path: 'previews/paisagem.jpg', type: 'image/jpeg' },
  { key: 'drone', path: 'previews/drone.webm', type: 'video/webm' },
  { key: 'city', path: 'previews/cidade.jpg', type: 'image/jpeg' },
] as const;

export type SampleKey = (typeof SAMPLE_FILES)[number]['key'];

/** Baixa as mídias do exemplo (vêm junto com o programa) como arquivos, como se a pessoa tivesse importado. */
export async function loadSampleFiles(): Promise<Record<SampleKey, File>> {
  const entries = await Promise.all(
    SAMPLE_FILES.map(async ({ key, path, type }) => {
      const response = await fetch(assetUrl(path));
      if (!response.ok) throw new Error(t('não deu para carregar "{name}"', { name: path }));
      return [key, new File([await response.blob()], path.split('/').pop()!, { type })] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<SampleKey, File>;
}

/** Zoom lento de a até b durante o clipe (para as fotos ganharem vida). */
const kenBurns = (duration: number, from: number, to: number) => ({
  ...createCamera(),
  fill: true,
  keyframes: {
    zoom: [
      { time: 0, value: from, easing: 'linear' as const },
      { time: duration, value: to, easing: 'linear' as const },
    ],
  },
});

/**
 * Monta o projeto de exemplo com as mídias já importadas. `shortcut(id)` dá o atalho atual de cada ação
 * (as dicas mostram a tecla que vale agora, mesmo que a pessoa tenha mudado).
 */
export function buildSampleProject(media: Record<SampleKey, MediaItem>, shortcut: (id: string) => string): Project {
  const { landscape, drone, city } = media;
  // Sem atalho (a pessoa tirou), a dica fala do atalho sem tecla.
  const key = (id: string) => shortcut(id) || t('(sem atalho)');
  const droneEnd = drone.duration || 27;
  const clip = (m: MediaItem, trimIn: number, trimOut: number, extra: Partial<VideoClip> = {}): VideoClip => ({
    ...createVideoClip(m),
    trimIn,
    trimOut,
    ...extra,
  });
  const effect = (id: string) => {
    const e = createEffect(id);
    return e ? [e] : [];
  };

  const clips = [
    clip(landscape, 0, 5, { filter: createFilter('filters/kodak-gold', 0.8), camera: kenBurns(5, 1, 1.15) }),
    clip(drone, 2, Math.min(droneEnd, 12), { filter: createFilter('filters/vivido', 0.7) }),
    clip(city, 0, 5, { filter: createFilter('filters/noite-neon', 0.6), effects: effect('effects/brilho'), camera: kenBurns(5, 1.15, 1) }),
    clip(drone, Math.min(droneEnd - 6, 18), Math.min(droneEnd, 24), { effects: effect('effects/vinheta') }),
  ];

  let project: Project = {
    ...createProject(),
    name: t('Projeto de exemplo'),
    media: [landscape, drone, city],
  };
  project = insertVideoClips(project, clips);
  const transitions = [createTransition('transitions/dissolver', 0.8), createTransition('transitions/whip-pan', 0.5), createTransition('transitions/zoom', 0.6)];
  project = { ...project, transitions: project.transitions.map((_, i) => transitions[i] ?? null) };

  const layout = layoutProject(project);
  const [a, b, c, d] = layout.clips;

  // Título na abertura e uma assinatura no fim.
  const preset = (id: string) => TEXT_PRESETS.find((p) => p.id === id);
  const title = preset('filme');
  if (title) project = placeTextClip(project, { ...createTextClip(title, 0.4, 3.6), text: t('PROJETO DE EXEMPLO') });
  const signature = preset('assinatura');
  if (signature && d) project = placeTextClip(project, { ...createTextClip(signature, d.start + 0.6, Math.max(1, d.length - 1)), text: t('agora é com você') });

  // Um pacote de edição (bloco na trilha de pacotes) por cima do trecho do drone.
  const pack = PACKS.find((p) => p.id === 'packs/trailer-epico') ?? PACKS.find((p) => p.anchor === 'clip' && !p.speed && !p.beat && !p.face);
  if (pack && b) project = applyPack(project, layoutProject(project), pack, b.start, { cover: { start: b.start, length: b.length } }).project;

  // Marcadores no começo de cada parte.
  const mark = (time: number, label: string) => {
    const added = addMarker(project, time);
    project = updateMarker(added.project, added.id, (m) => ({ ...m, label }));
  };
  if (b) mark(b.start, t('Drone'));
  if (c) mark(c.start, t('Cidade à noite'));
  if (d) mark(d.start, t('Final'));

  // Dicas nos comentários (balões na régua; a lista fica em Ferramentas).
  const tips: [number, string][] = [
    [0.5, t('Bem-vindo! Este projeto é só para experimentar: mexa à vontade. {keys} desfaz qualquer coisa.', { keys: key('undo') })],
    [2.5, t('{keys} toca e pausa. Os balões como este na régua são comentários: marque como feito quando terminar.', { keys: key('playPause') })],
    [a ? a.start + a.length - 0.4 : 4.6, t('Clique no ◆ entre dois clipes para trocar a transição.')],
    [b ? b.start + 2 : 7, t('Aperte {keys} para dividir o clipe no cursor.', { keys: key('split') })],
    [b ? b.start + 5 : 10, t('O bloco na trilha de pacotes é um pacote de edição: arraste as bordas para encaixar ou exclua para ver o vídeo sem ele.')],
    [c ? c.start + 1 : 15, t('Arraste um filtro da biblioteca até o clipe (ou clique nele com o clipe selecionado).')],
    [c ? c.start + 3 : 17, t('Clique direito em qualquer coisa abre o menu dela.')],
    [d ? d.start + 1 : 20, t('{keys} põe um marcador no cursor; {jump} pula entre os cortes e os marcadores.', { keys: key('marker'), jump: key('nextEdit') })],
    [d ? d.start + d.length - 1 : 23, t('Pronto para o seu? Importe os seus vídeos, ou {keys} para salvar este. Os atalhos dá para mudar em Ferramentas → Atalhos do teclado.', { keys: key('save') })],
  ];
  const comments: TimelineComment[] = tips.map(([time, text]) => ({ id: uid(), time: Math.max(0, time), text, done: false }));
  return { ...project, comments: comments.sort((x, y) => x.time - y.time) };
}
