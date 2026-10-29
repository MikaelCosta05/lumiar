export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'pack'; id: string }
  | { kind: 'transition'; index: number }
  | null;

/** Um item na seleção de vários itens da timeline. */
export type MultiItem = { kind: 'clip' | 'audio' | 'text' | 'overlay' | 'pack'; id: string };

/** Tipo usado ao arrastar um efeito/transição/filtro da biblioteca para a timeline. */
export const PLUGIN_MIME = 'application/x-lumiar-plugin';
/** Tipo usado ao arrastar uma mídia da biblioteca para a timeline. */
export const MEDIA_MIME = 'application/x-lumiar-media';
/** Tipo usado ao arrastar um estilo de texto da biblioteca para a timeline. */
export const TEXT_PRESET_MIME = 'application/x-lumiar-text';
/** Tipo usado ao arrastar um pacote de edição da biblioteca para a timeline. */
export const PACK_MIME = 'application/x-lumiar-pack';
/** Tipo usado ao arrastar um efeito sonoro da biblioteca para a timeline. */
export const SOUND_MIME = 'application/x-lumiar-sound';
