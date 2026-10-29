import { BookmarkPlus, Copy, Download, Fish, LoaderCircle, Play, Scissors, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mixAudio } from '../media/exporter';
import { chapterTime, chaptersText, findHighlights, makeChapters } from '../project/highlights';
import { layoutProject, type Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Segmented } from './kit';

function Modal({ title, icon, onClose, children, wide }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={cx('animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl', wide ? 'w-[560px]' : 'w-[460px]')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-accent">{icon}</span>
          <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Volume do projeto inteiro (vídeos e trilhas mixados), `rate` vezes por segundo. */
export async function projectEnvelope(project: Project, rate: number): Promise<Float32Array | null> {
  const buffer = await mixAudio(project, layoutProject(project));
  if (!buffer) return null;
  const data = buffer.getChannelData(0);
  const hop = Math.floor(buffer.sampleRate / rate);
  const env = new Float32Array(Math.floor(data.length / hop));
  for (let i = 0; i < env.length; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += data[j] * data[j];
    env[i] = Math.sqrt(s / hop);
  }
  return env;
}

/**
 * Gancho de abertura: o trecho mais forte do vídeo (fala mais alta e empolgada) repetido nos primeiros
 * segundos, como "prévia" antes da introdução.
 */
export function HookDialog({
  project,
  onSeek,
  onUse,
  onClose,
}: {
  project: Project;
  onSeek: (time: number) => void;
  onUse: (start: number, end: number) => void;
  onClose: () => void;
}) {
  const [length, setLength] = useState(3);
  const [envelope, setEnvelope] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const RATE = 20;
  useEffect(() => {
    let alive = true;
    void projectEnvelope(project, RATE)
      .then((env) => alive && (env ? setEnvelope(env) : setError(t('O projeto não tem som para achar o momento mais forte.'))))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [project]);
  const total = envelope ? envelope.length / RATE : 0;
  // Os primeiros segundos não contam: o gancho é para mostrar algo que vem depois.
  const candidates = envelope ? findHighlights(envelope, RATE, 6, length, project).filter((h) => h.start > Math.min(8, total * 0.1)).slice(0, 3) : [];

  return (
    <Modal title={t('Gancho de abertura')} icon={<Fish size={18} />} onClose={onClose} wide>
      <p className="mb-3 text-xs leading-relaxed text-dim">
        {t(
          'Os primeiros segundos decidem se a pessoa fica. O Lumiar acha os momentos mais fortes do vídeo; o escolhido é copiado para o começo, como uma prévia, e o resto do vídeo anda para a frente.',
        )}
      </p>
      <div className="mb-3 flex items-center gap-2 text-xs text-dim">
        {t('Duração da prévia')}
        <Segmented
          value={length}
          onChange={setLength}
          options={[
            { value: 2, label: '2s' },
            { value: 3, label: '3s' },
            { value: 5, label: '5s' },
          ]}
        />
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : !envelope ? (
        <p className="flex items-center gap-2 text-xs text-dim">
          <LoaderCircle size={14} className="animate-spin text-accent" /> {t('Ouvindo o vídeo…')}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-dim">{t('O vídeo é curto demais para um gancho.')}</p>
      ) : (
        <div className="space-y-1.5">
          {candidates.map((h, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{i + 1}</span>
              <span className="flex-1 font-mono text-xs">
                {formatTime(h.start)} → {formatTime(h.end)}
              </span>
              <IconButton label={t('Ouvir')} onClick={() => onSeek(h.start)}>
                <Play size={13} />
              </IconButton>
              <Button variant={i === 0 ? 'primary' : 'secondary'} className="h-7 text-xs" onClick={() => onUse(h.start, h.end)}>
                {t('Usar')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Capítulos prontos para colar na descrição do YouTube. */
export function ChaptersDialog({ project, onClose, notify }: { project: Project; onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const chapters = makeChapters(project, layoutProject(project).duration);
  const [text, setText] = useState(chaptersText(chapters));
  return (
    <Modal title={t('Capítulos para o YouTube')} icon={<BookmarkPlus size={18} />} onClose={onClose}>
      {chapters.length < 3 ? (
        <p className="text-xs leading-relaxed text-dim">
          {t('Para criar capítulos, marque os pontos com')} <b>M</b> {t('(e dê nome aos marcadores) ou transcreva o vídeo na aba')} <b>{t('Texto')}</b>.{' '}
          {t('O YouTube precisa de pelo menos 3 capítulos de 10 segundos ou mais.')}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs leading-relaxed text-dim">
            {project.markers.length >= 2 ? t('Feitos a partir dos seus marcadores.') : t('Feitos a partir da fala (pausas e começo das frases).')}{' '}
            {t('Edite os títulos e cole na descrição.')}
          </p>
          <textarea className="field h-56 w-full resize-y py-2 font-mono text-xs leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 flex justify-end">
            <Button
              variant="primary"
              icon={<Copy size={14} />}
              onClick={async () => {
                await navigator.clipboard.writeText(text).catch(() => {});
                notify(t('Capítulos copiados. Cole na descrição do vídeo no YouTube.'));
              }}
            >
              {t('Copiar')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

export interface Highlight {
  start: number;
  end: number;
  score: number;
}

/** Trechos mais animados do vídeo, para virar Shorts/Reels (exporta em 9:16). */
export function HighlightsDialog({
  project,
  onClose,
  onSeek,
  onExport,
  onMark,
}: {
  project: Project;
  onClose: () => void;
  onSeek: (time: number) => void;
  onExport: (highlights: Highlight[]) => void;
  onMark: (highlights: Highlight[]) => void;
}) {
  const [length, setLength] = useState(45);
  const [envelope, setEnvelope] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const RATE = 20;

  useEffect(() => {
    let alive = true;
    // O som do projeto todo (vídeos e trilhas), em volume 20× por segundo.
    void projectEnvelope(project, RATE)
      .then((env) => {
        if (!alive) return;
        if (!env) setError(t('O projeto não tem som para analisar.'));
        else setEnvelope(env);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [project]);

  const highlights = envelope ? findHighlights(envelope, RATE, 4, length, project) : [];

  return (
    <Modal title={t('Destaques para Shorts e Reels')} icon={<Scissors size={18} />} onClose={onClose} wide>
      <p className="mb-3 text-xs leading-relaxed text-dim">
        {t(
          'O Lumiar procura os trechos mais animados (fala mais alta e empolgada, risadas, picos de som) e sugere cortes verticais. Começo e fim caem em pausas da fala quando o vídeo está transcrito.',
        )}
      </p>
      <div className="mb-3 flex items-center gap-2 text-xs text-dim">
        {t('Duração')}
        <Segmented
          value={length}
          onChange={setLength}
          options={[
            { value: 30, label: '30 s' },
            { value: 45, label: '45 s' },
            { value: 60, label: '60 s' },
          ]}
        />
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : !envelope ? (
        <p className="flex items-center gap-2 text-xs text-dim">
          <LoaderCircle size={14} className="animate-spin text-accent" /> {t('Ouvindo o vídeo…')}
        </p>
      ) : highlights.length === 0 ? (
        <p className="text-xs text-dim">{t('O vídeo é curto demais para separar destaques.')}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{i + 1}</span>
                <span className="flex-1 font-mono text-xs">
                  {chapterTime(h.start)} → {chapterTime(h.end)} <span className="text-faint">· {formatTime(h.end - h.start).replace(/\.\d+$/, '')}</span>
                </span>
                <IconButton label={t('Ir até lá e tocar')} onClick={() => onSeek(h.start)}>
                  <Play size={13} />
                </IconButton>
                <IconButton label={t('Exportar este em 9:16')} onClick={() => onExport([h])}>
                  <Download size={13} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button icon={<BookmarkPlus size={14} />} onClick={() => onMark(highlights)}>
              {t('Marcar na timeline')}
            </Button>
            <Button variant="primary" icon={<Download size={14} />} onClick={() => onExport(highlights)}>
              {t('Exportar todos (9:16)')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
