import type { PluginKind, PreviewMedia } from '../engine/types';

export type { PreviewMedia };

/**
 * Qual mídia de exemplo (em /public/previews, ver CREDITOS.md) aparece na miniatura de cada filtro,
 * efeito, transição e pacote. O padrão é a pessoa falando: paisagem, cidade e drone ficam só para o
 * que foi feito para cenários (trocar o céu, clima, voo de drone, noite na cidade…).
 * Nada de gente desenhada: quem precisa da pessoa usa o vídeo real com o recorte da IA.
 */

export interface PreviewSource {
  file: string;
  video: boolean;
  /** Tem gente na imagem (só então vale recortar a pessoa) */
  person: boolean;
  /** Vídeos: instante (s) do quadro das miniaturas paradas */
  still?: number;
  /** Fotos: altura (0 a 1) que fica no centro ao recortar para 16:9 */
  focusY?: number;
}

export const PREVIEW_SOURCES: Record<PreviewMedia, PreviewSource> = {
  // Olhando para a câmera, de frente, por volta dos 3 s.
  pessoa: { file: 'previews/pessoa.webm', video: true, person: true, still: 3 },
  // Braços abertos no meio de um giro: o segundo antes tem movimento para os rastros e clones.
  movimento: { file: 'previews/movimento.webm', video: true, person: true, still: 6.2 },
  // Mão já encostada no vidro.
  silhueta: { file: 'previews/silhueta.webm', video: true, person: true, still: 4.5 },
  retrato: { file: 'previews/retrato.jpg', video: false, person: true, focusY: 0.38 },
  paisagem: { file: 'previews/paisagem.jpg', video: false, person: false },
  cidade: { file: 'previews/cidade.jpg', video: false, person: false },
  drone: { file: 'previews/drone.webm', video: true, person: false, still: 5 },
};

export const PREVIEW_MEDIA = Object.keys(PREVIEW_SOURCES) as PreviewMedia[];

export function isPreviewMedia(value: unknown): value is PreviewMedia {
  return typeof value === 'string' && value in PREVIEW_SOURCES;
}

/** Plugins que pedem outra mídia que não a da categoria. */
const PLUGIN_MEDIA: Record<string, PreviewMedia> = {
  // Clima embaixo d'água fica melhor na pessoa.
  'effects/debaixo-dagua': 'pessoa',
  'effects/pequeno-planeta': 'paisagem',
  'effects/vhs': 'silhueta',
  'effects/estatica-tv': 'silhueta',
  // Filtros de paisagem: folhas, céu, estação do ano, tempo lá fora.
  'filters/aerochrome': 'paisagem',
  'filters/velvia': 'paisagem',
  'filters/infravermelho-pb': 'paisagem',
  'filters/azul-ensolarado': 'paisagem',
  'filters/beira-mar': 'paisagem',
  'filters/estrada': 'paisagem',
  'filters/dias-de-chuva': 'paisagem',
  'filters/deserto-pos-apocaliptico': 'paisagem',
  'filters/artico': 'paisagem',
  'filters/deserto': 'paisagem',
  'filters/floresta': 'paisagem',
  'filters/inverno': 'paisagem',
  'filters/nevoa': 'paisagem',
  'filters/noite-americana': 'paisagem',
  'filters/outono': 'paisagem',
  'filters/primavera': 'paisagem',
  'filters/tempestade': 'paisagem',
  'filters/tropical': 'paisagem',
  // Luzes da cidade à noite.
  'filters/noite-neon': 'cidade',
  'filters/neo-noir': 'cidade',
  'filters/cyberpunk': 'cidade',
  'filters/cinestill': 'cidade',
  'filters/terror': 'silhueta',
};

/** Categorias de plugin com mídia própria (as outras ficam com a pessoa). */
const PLUGIN_CATEGORY_MEDIA: Record<string, PreviewMedia> = {
  Profundidade: 'paisagem',
  Clima: 'paisagem',
  Retrato: 'retrato',
  Tempo: 'movimento',
  // Fita VHS e TV analógica: o clima de terror analógico.
  Analógico: 'silhueta',
};

/** Pacotes que pedem outra mídia que não a da categoria. */
const PACK_MEDIA: Record<string, PreviewMedia> = {
  // Câmera em movimento: os voos e as revelações de cenário vão no drone; os outros, na pessoa.
  'packs/drone-subindo': 'drone',
  'packs/subindo': 'drone',
  'packs/descendo': 'drone',
  'packs/orbita': 'drone',
  'packs/revelacao': 'drone',
  'packs/travelling': 'drone',
  'packs/viagem': 'drone',
  'packs/timelapse': 'drone',
  'packs/faroeste': 'paisagem',
  'packs/neo-noir': 'cidade',
  'packs/vista-do-alto': 'drone',
  // Fatias espelhadas giram melhor no cenário que numa pessoa.
  'packs/psicodelico': 'paisagem',
  // Rastros e clones precisam de alguém se mexendo.
  'packs/giro-do-look': 'movimento',
  'packs/clones-no-ritmo': 'movimento',
  'packs/clipe-pintado': 'movimento',
  'packs/a-sombra-nao-acompanha': 'movimento',
  'packs/camuflagem-optica': 'movimento',
  // Os olhos precisam de um rosto de frente (o efeito não deforma nada, como na prévia dele).
  'packs/brilho-nos-olhos': 'retrato',
};

const PACK_CATEGORY_MEDIA: Record<string, PreviewMedia> = {
  'Clima e estações': 'paisagem',
  'Suspense e terror': 'silhueta',
  'Terror analógico': 'silhueta',
  'Found footage': 'silhueta',
  Esportes: 'movimento',
};

/** "Terror analógico", "Horror"… também valem para categorias novas com outro nome. */
const HORROR = /terror|horror|suspense|assombr/;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface PluginInfo {
  id: string;
  kind: PluginKind;
  category: string;
  previewMedia?: unknown;
}

/** O que o shader usa do tempo (de pluginInputs): quem olha para o passado precisa de movimento. */
interface TimeInputs {
  history?: boolean;
  state?: boolean;
  motion?: boolean;
}

/**
 * Mídia da miniatura de um plugin: "previewMedia" do plugin.json, a lista acima, a categoria,
 * movimento para quem usa quadros passados e, no resto, a pessoa falando.
 * Nas transições, é o primeiro clipe (o segundo vem de `secondMedia`).
 */
export function pluginMedia(plugin: PluginInfo, inputs: TimeInputs = {}): PreviewMedia {
  if (isPreviewMedia(plugin.previewMedia)) return plugin.previewMedia;
  const byId = PLUGIN_MEDIA[plugin.id];
  if (byId) return byId;
  const byCategory = PLUGIN_CATEGORY_MEDIA[plugin.category];
  if (byCategory) return byCategory;
  if (HORROR.test(normalize(plugin.category))) return 'silhueta';
  // Transições usam o movimento como segundo clipe; o primeiro fica com a pessoa.
  if (plugin.kind !== 'transition' && (inputs.history || inputs.state || inputs.motion)) return 'movimento';
  return 'pessoa';
}

/** O "próximo clipe" das transições: outra pessoa, se mexendo. */
export function secondMedia(first: PreviewMedia): PreviewMedia {
  return first === 'movimento' ? 'pessoa' : 'movimento';
}

/** Mídia da miniatura de um pacote: a lista acima, a categoria ou a pessoa. */
export function packMedia(pack: { id: string; category: string }): PreviewMedia {
  return PACK_MEDIA[pack.id] ?? PACK_CATEGORY_MEDIA[pack.category] ?? (HORROR.test(normalize(pack.category)) ? 'silhueta' : 'pessoa');
}
