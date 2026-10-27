export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'audio'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'transition'; index: number }
  | null;

/** Tipo usado ao arrastar um efeito/transição/filtro da biblioteca para a timeline. */
export const PLUGIN_MIME = 'application/x-lumiar-plugin';
/** Tipo usado ao arrastar uma mídia da biblioteca para a timeline. */
export const MEDIA_MIME = 'application/x-lumiar-media';
/** Tipo usado ao arrastar um estilo de texto da biblioteca para a timeline. */
export const TEXT_PRESET_MIME = 'application/x-lumiar-text';
