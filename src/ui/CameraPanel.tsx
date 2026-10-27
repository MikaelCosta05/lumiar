import { Crosshair, Expand, ScanFace, Video, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Keyframe } from '../engine/keyframes';
import type { ParamDef } from '../engine/types';
import { CAMERA_PRESETS, createCamera, presetKeyframes, type Camera, type CameraTransform } from '../project/camera';
import type { VideoClip } from '../project/model';
import { Button, cx, SectionTitle, Slider, Switch } from './kit';
import { bindKeyframes, type KeyframeContext } from './keyframeUi';
import { ParamControl } from './ParamControl';

interface Props {
  clip: VideoClip;
  ctx: KeyframeContext;
  clipLength: number;
  onChange: (update: (clip: VideoClip) => VideoClip) => void;
  onFollowFace: () => void;
  onPickPoint: () => void;
  picking: boolean;
}

const CONTROLS: { key: keyof CameraTransform; def: ParamDef }[] = [
  { key: 'zoom', def: { id: 'zoom', label: 'Zoom', type: 'float', default: 1, min: 0.5, max: 4, step: 0.01 } },
  { key: 'x', def: { id: 'x', label: 'Horizontal', type: 'float', default: 0.5, min: 0, max: 1, step: 0.005 } },
  { key: 'y', def: { id: 'y', label: 'Vertical', type: 'float', default: 0.5, min: 0, max: 1, step: 0.005 } },
  { key: 'rotation', def: { id: 'rotation', label: 'Rotação', type: 'float', default: 0, min: -180, max: 180, step: 1 } },
];

export function CameraPanel({ clip, ctx, clipLength, onChange, onFollowFace, onPickPoint, picking }: Props) {
  const camera = clip.camera ?? createCamera();
  const setCamera = (update: (camera: Camera) => Camera) =>
    onChange((c) => ({ ...c, camera: update(c.camera ?? createCamera()) }));
  const follow = camera.follow;
  const activePreset = CAMERA_PRESETS.find((p) => JSON.stringify(presetKeyframes(p, clipLength)) === JSON.stringify(camera.keyframes));

  return (
    <>
      <SectionTitle extra={<Video size={12} className="text-faint" />}>Seguir automaticamente</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={follow?.kind === 'face' ? 'primary' : 'secondary'}
          icon={<ScanFace size={14} />}
          onClick={onFollowFace}
          title="Detecta o rosto em cada momento e enquadra"
        >
          Seguir rosto
        </Button>
        <Button
          variant={picking || follow?.kind === 'point' ? 'primary' : 'secondary'}
          icon={<Crosshair size={14} />}
          onClick={onPickPoint}
          title="Clique num ponto do vídeo para a câmera acompanhar"
        >
          {picking ? 'Clique no vídeo…' : 'Seguir ponto'}
        </Button>
      </div>

      {follow && (
        <div className="mt-2 rounded-xl border border-line bg-panel-2 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {follow.kind === 'face' ? 'Seguindo o rosto' : 'Seguindo o ponto'} · {follow.points.length} posições
            </span>
            <button
              title="Parar de seguir"
              onClick={() => setCamera((c) => ({ ...c, follow: null }))}
              className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
          <Range
            label="Zoom ao seguir"
            value={follow.zoom}
            display={`${follow.zoom.toFixed(2)}×`}
            min={1}
            max={4}
            step={0.01}
            onChange={(zoom) => setCamera((c) => ({ ...c, follow: c.follow && { ...c.follow, zoom } }))}
          />
          <Range
            label="Suavidade"
            value={follow.smoothness}
            display={`${follow.smoothness.toFixed(2)}s`}
            min={0.05}
            max={2}
            step={0.05}
            onChange={(smoothness) => setCamera((c) => ({ ...c, follow: c.follow && { ...c.follow, smoothness } }))}
          />
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <Chip active={follow.mode === 'center'} onClick={() => setCamera((c) => ({ ...c, follow: c.follow && { ...c.follow, mode: 'center' } }))}>
              Manter no centro
            </Chip>
            <Chip active={follow.mode === 'lock'} onClick={() => setCamera((c) => ({ ...c, follow: c.follow && { ...c.follow, mode: 'lock' } }))}>
              Estabilizar
            </Chip>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-faint">
            {follow.mode === 'center'
              ? 'O alvo fica sempre no centro. Use Horizontal/Vertical em Enquadramento para ajustar.'
              : 'O alvo fica parado onde estava: bom para tirar tremidos da câmera.'}
          </p>
        </div>
      )}
      <SectionTitle>Movimentos prontos</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        <Chip active={!activePreset && Object.keys(camera.keyframes).length === 0} onClick={() => setCamera((c) => ({ ...c, keyframes: {}, base: { ...c.base, zoom: 1, x: 0.5, y: 0.5, rotation: 0 } }))}>
          Parada
        </Chip>
        {CAMERA_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            active={activePreset?.id === preset.id}
            onClick={() => setCamera((c) => ({ ...c, keyframes: presetKeyframes(preset, clipLength) }))}
          >
            {preset.name}
          </Chip>
        ))}
      </div>

      <SectionTitle>Enquadramento</SectionTitle>
      <div className="flex items-center justify-between py-1">
        <span className="flex items-center gap-1.5 text-xs text-dim">
          <Expand size={12} /> Preencher a tela
        </span>
        <Switch checked={camera.fill} label="Preencher a tela" onChange={(fill) => setCamera((c) => ({ ...c, fill }))} />
      </div>

      <div className="mt-1">
        {CONTROLS.map(({ key, def }) => {
          const binding = bindKeyframes(
            ctx,
            camera.keyframes[key],
            camera.base[key],
            (v: number) => setCamera((c) => ({ ...c, base: { ...c.base, [key]: v } })),
            (kfs: Keyframe[] | undefined) =>
              setCamera((c) => {
                const keyframes = { ...c.keyframes };
                if (kfs) keyframes[key] = kfs;
                else delete keyframes[key];
                return { ...c, keyframes };
              }),
          );
          return (
            <ParamControl
              key={key}
              def={follow && (key === 'x' || key === 'y') ? { ...def, label: `${def.label} (ajuste)` } : def}
              value={binding.value}
              onChange={(v) => binding.onChange(v as number)}
              keyframes={binding.control}
            />
          );
        })}
      </div>

    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'truncate rounded-lg border px-1.5 py-1.5 text-center text-[11px] transition-colors',
        active ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
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
