import type { KeyframeMap } from './keyframes';

export type ParamType = 'float' | 'vec2' | 'color';

/** float → número; vec2 → [x, y]; color → [r, g, b] de 0 a 1 */
export type ParamValue = number | number[];
export type ParamValues = Record<string, ParamValue>;

export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  /** Cores podem vir como "#rrggbb" no plugin.json */
  default: number | number[] | string;
  min?: number;
  max?: number;
  step?: number;
}

export type PluginKind = 'effect' | 'transition' | 'filter';

/** Mídia de exemplo das miniaturas e prévias (em /public/previews). */
export type PreviewMedia = 'pessoa' | 'movimento' | 'silhueta' | 'retrato' | 'paisagem' | 'cidade' | 'drone';

export interface ShaderPlugin {
  /** "effects/glitch", "transitions/dissolver", "filters/cinema"... */
  id: string;
  kind: PluginKind;
  name: string;
  description: string;
  category: string;
  params: ParamDef[];
  previewParams: ParamValues;
  /** "previewMedia" no plugin.json: a mídia das miniaturas (sem ele, vale a categoria). */
  previewMedia?: PreviewMedia;
  glsl: string;
}

export interface EffectInstance {
  uid: string;
  pluginId: string;
  enabled: boolean;
  params: ParamValues;
  /** Animação dos parâmetros ao longo do clipe (pelo id do parâmetro). */
  keyframes?: KeyframeMap;
}

/** Filtro de cor: um por clipe, com intensidade de 0 a 1. */
export interface FilterInstance {
  pluginId: string;
  intensity: number;
  params: ParamValues;
  /** Pode animar "intensity" e os parâmetros do filtro. */
  keyframes?: KeyframeMap;
}
