import { CaseUpper, Clapperboard, Italic, Move, Paintbrush, TextAlignCenter, TextAlignEnd, TextAlignStart, Trash, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ANIMATIONS,
  FONTS,
  LOOPS,
  TEXT_PRESETS,
  createTextClip,
  type TextAnimation,
  type TextClip,
  type TextLoop,
  type TextStyle,
} from '../project/text';
import { formatTime } from './format';
import { InspectorHeader, InspectorPanel } from './InspectorPanel';
import { cx, IconButton, SectionTitle, Slider, Switch, Tabs, type TabItem } from './kit';
import { TextPresetThumb } from './TextPresetThumb';

interface Props {
  clip: TextClip;
  trackName: string;
  tab: TextTab;
  onTab: (tab: TextTab) => void;
  onChange: (update: (clip: TextClip) => TextClip) => void;
  onRemove: () => void;
}

/** 3×3 posições rápidas na tela. */
const POSITIONS: [number, number][] = [
  [0.2, 0.15], [0.5, 0.15], [0.8, 0.15],
  [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
  [0.2, 0.85], [0.5, 0.85], [0.8, 0.85],
];

export type TextTab = 'text' | 'style' | 'position' | 'animation';

const TABS: TabItem<TextTab>[] = [
  { id: 'text', label: 'Texto', icon: <Type size={14} /> },
  { id: 'style', label: 'Estilo', icon: <Paintbrush size={14} /> },
  { id: 'position', label: 'Posição', icon: <Move size={14} /> },
  { id: 'animation', label: 'Animação', icon: <Clapperboard size={14} /> },
];

export function TextInspector({ clip, trackName, tab, onTab, onChange, onRemove }: Props) {
  const st = clip.style;
  const setStyle = (patch: Partial<TextStyle>) => onChange((c) => ({ ...c, style: { ...c.style, ...patch } }));
  const font = FONTS.find((f) => f.family === st.font);

  return (
    <InspectorPanel
      header={
        <InspectorHeader
          thumb={
            <span className="flex size-full items-center justify-center bg-gradient-to-br from-[#6d28d9] to-[#c026d3] text-white">
              <Type size={22} />
            </span>
          }
          kicker={`Texto · ${trackName} · ${formatTime(clip.start)}`}
          title={clip.text.split('\n')[0] || 'Texto'}
          chips={<Chip>{clip.duration.toFixed(1)}s na tela</Chip>}
          actions={
            <IconButton label="Remover texto" className="hover:!text-danger" onClick={onRemove}>
              <Trash size={14} />
            </IconButton>
          }
        />
      }
      tabs={<Tabs tabs={TABS} value={tab} onChange={onTab} />}
    >
      {tab === 'text' && (
        <>
          <textarea
            className="field h-auto min-h-20 w-full resize-y py-2 leading-snug"
            rows={3}
            value={clip.text}
            onChange={(e) => {
              const text = e.target.value;
              onChange((c) => ({ ...c, text }));
            }}
            placeholder="Digite o texto…"
            style={{ fontFamily: `"${st.font}"` }}
          />

          <SectionTitle>Fonte</SectionTitle>
          <select className="field w-full" value={st.font} onChange={(e) => setStyle({ font: e.target.value })} style={{ fontFamily: `"${st.font}"` }}>
            {FONTS.map((f) => (
              <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-1">
            {font && font.weights.length > 1 && (
              <select className="field h-7 min-w-0 flex-1 text-xs" value={st.weight} onChange={(e) => setStyle({ weight: Number(e.target.value) })}>
                {font.weights.map((w) => (
                  <option key={w} value={w}>
                    {w <= 400 ? 'Normal' : w <= 700 ? 'Negrito' : 'Extra negrito'}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-0.5 rounded-lg bg-panel-2 p-0.5 ring-1 ring-line">
              <IconButton label="Itálico" active={st.italic} onClick={() => setStyle({ italic: !st.italic })}>
                <Italic size={14} />
              </IconButton>
              <IconButton label="Maiúsculas" active={st.uppercase} onClick={() => setStyle({ uppercase: !st.uppercase })}>
                <CaseUpper size={15} />
              </IconButton>
              <span className="mx-0.5 h-4 w-px bg-line" />
              <IconButton label="Alinhar à esquerda" active={st.align === 'left'} onClick={() => setStyle({ align: 'left' })}>
                <TextAlignStart size={14} />
              </IconButton>
              <IconButton label="Centralizar" active={st.align === 'center'} onClick={() => setStyle({ align: 'center' })}>
                <TextAlignCenter size={14} />
              </IconButton>
              <IconButton label="Alinhar à direita" active={st.align === 'right'} onClick={() => setStyle({ align: 'right' })}>
                <TextAlignEnd size={14} />
              </IconButton>
            </div>
          </div>
          <Range label="Tamanho" value={st.size} display={`${Math.round(st.size * 100)}%`} min={0.02} max={0.35} step={0.005} onChange={(size) => setStyle({ size })} />
          <Range label="Espaço entre letras" value={st.letterSpacing} display={st.letterSpacing.toFixed(2)} min={-0.1} max={0.6} step={0.01} onChange={(letterSpacing) => setStyle({ letterSpacing })} />
          <Range label="Altura da linha" value={st.lineHeight} display={st.lineHeight.toFixed(2)} min={0.8} max={2} step={0.05} onChange={(lineHeight) => setStyle({ lineHeight })} />

          <SectionTitle>Estilos prontos</SectionTitle>
          <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                title={preset.name}
                onClick={() =>
                  onChange((c) => {
                    const base = createTextClip(preset, c.start, c.duration);
                    return { ...base, id: c.id, text: c.text, x: c.x, y: c.y };
                  })
                }
                className="group min-w-0 text-left"
              >
                <div className="aspect-video overflow-hidden rounded-md bg-panel-3 ring-2 ring-transparent transition-all group-hover:ring-accent">
                  <TextPresetThumb preset={preset} live={false} />
                </div>
                <p className="mt-1 truncate text-[10px] text-faint group-hover:text-dim">{preset.name}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'style' && (
        <>
          <SectionTitle>Preenchimento</SectionTitle>
          <Row label="Cor">
            <ColorInput value={st.color} onChange={(color) => setStyle({ color })} />
          </Row>
          <Row label="Degradê">
            {st.gradient !== null && <ColorInput value={st.gradient} onChange={(gradient) => setStyle({ gradient })} />}
            <Switch checked={st.gradient !== null} label="Degradê" onChange={(on) => setStyle({ gradient: on ? '#ff3e8a' : null })} />
          </Row>

          <SectionTitle>Contorno e sombra</SectionTitle>
          <Row label="Cor do contorno">
            <ColorInput value={st.outlineColor} onChange={(outlineColor) => setStyle({ outlineColor })} />
          </Row>
          <Range label="Espessura do contorno" value={st.outlineWidth} display={st.outlineWidth.toFixed(2)} min={0} max={0.2} step={0.005} onChange={(outlineWidth) => setStyle({ outlineWidth })} />
          <Range label="Sombra" value={st.shadow} display={`${Math.round(st.shadow * 100)}%`} min={0} max={1} step={0.01} onChange={(shadow) => setStyle({ shadow })} />

          <SectionTitle>Brilho neon</SectionTitle>
          <Row label="Cor do brilho">
            <ColorInput value={st.glowColor} onChange={(glowColor) => setStyle({ glowColor })} />
          </Row>
          <Range label="Intensidade" value={st.glow} display={`${Math.round(st.glow * 100)}%`} min={0} max={1} step={0.01} onChange={(glow) => setStyle({ glow })} />

          <SectionTitle>Caixa de fundo</SectionTitle>
          <Row label="Mostrar caixa">
            {st.box && <ColorInput value={st.boxColor} onChange={(boxColor) => setStyle({ boxColor })} />}
            <Switch checked={st.box} label="Caixa de fundo" onChange={(box) => setStyle({ box })} />
          </Row>
          {st.box && (
            <Range label="Opacidade da caixa" value={st.boxOpacity} display={`${Math.round(st.boxOpacity * 100)}%`} min={0} max={1} step={0.01} onChange={(boxOpacity) => setStyle({ boxOpacity })} />
          )}
        </>
      )}

      {tab === 'position' && (
        <>
          <SectionTitle>Posição na tela</SectionTitle>
          <div className="flex items-center gap-3">
            <div className="grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-panel-2 p-1.5 ring-1 ring-line">
              {POSITIONS.map(([x, y]) => {
                const active = Math.abs(clip.x - x) < 0.02 && Math.abs(clip.y - y) < 0.02;
                return (
                  <button
                    key={`${x}-${y}`}
                    title="Posicionar"
                    onClick={() => onChange((c) => ({ ...c, x, y }))}
                    className={cx('size-6 rounded transition-colors', active ? 'bg-accent' : 'bg-panel-3 hover:bg-line-strong')}
                  />
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-faint">Escolha um ponto, use os controles abaixo ou arraste o texto direto na tela.</p>
          </div>
          <Range label="Horizontal" value={clip.x} display={`${Math.round(clip.x * 100)}%`} min={0} max={1} step={0.005} onChange={(x) => onChange((c) => ({ ...c, x }))} />
          <Range label="Vertical" value={clip.y} display={`${Math.round(clip.y * 100)}%`} min={0} max={1} step={0.005} onChange={(y) => onChange((c) => ({ ...c, y }))} />
          <Range label="Rotação" value={clip.rotation} display={`${Math.round(clip.rotation)}°`} min={-180} max={180} step={1} onChange={(rotation) => onChange((c) => ({ ...c, rotation }))} />
        </>
      )}

      {tab === 'animation' && (
        <>
          <SectionTitle>Animações</SectionTitle>
          <Row label="Entrada">
            <AnimSelect value={clip.animIn} onChange={(animIn) => onChange((c) => ({ ...c, animIn }))} />
          </Row>
          <Row label="Saída">
            <AnimSelect value={clip.animOut} onChange={(animOut) => onChange((c) => ({ ...c, animOut }))} />
          </Row>
          <Row label="Durante">
            <select className="field h-7 w-40 text-xs" value={clip.loop} onChange={(e) => onChange((c) => ({ ...c, loop: e.target.value as TextLoop }))}>
              {LOOPS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Row>
          <SectionTitle>Tempo</SectionTitle>
          <Range label="Velocidade da animação" value={clip.animDuration} display={`${clip.animDuration.toFixed(1)}s`} min={0.1} max={3} step={0.1} onChange={(animDuration) => onChange((c) => ({ ...c, animDuration }))} />
          <Range label="Tempo na tela" value={clip.duration} display={`${clip.duration.toFixed(1)}s`} min={0.5} max={30} step={0.1} onChange={(duration) => onChange((c) => ({ ...c, duration }))} />
        </>
      )}
    </InspectorPanel>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded bg-panel-3 px-1.5 font-mono text-[10px] text-dim">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-dim">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

function Range(props: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{props.label}</span>
        <span className="font-mono text-[11px]">{props.display}</span>
      </div>
      <Slider label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-1.5 py-1 hover:border-line-strong">
      <span className="size-4 rounded-sm ring-1 ring-white/20" style={{ background: value }} />
      <span className="font-mono text-[11px] uppercase text-dim">{value}</span>
      <input type="color" className="sr-only" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function AnimSelect({ value, onChange }: { value: TextAnimation; onChange: (v: TextAnimation) => void }) {
  return (
    <select className="field h-7 w-40 text-xs" value={value} onChange={(e) => onChange(e.target.value as TextAnimation)}>
      {ANIMATIONS.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
