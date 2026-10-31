// A tela de carregamento (o HTML dela está no index.html, para aparecer antes de qualquer JavaScript).

export interface Splash {
  /** O que está sendo preparado e a barra (0 a 1); `count` aparece à direita (ex.: "120 de 664"). */
  step(text: string, fraction: number, count?: string): void;
  lema(text: string): void;
  dica(text: string): void;
  /** Mostra o botão para entrar sem esperar; `onClick` é chamado uma vez. */
  skip(label: string, onClick: () => void): void;
  versao(text: string): void;
  /** Some devagar, já com o editor desenhado por baixo. */
  close(): Promise<void>;
}

export function getSplash(): Splash {
  const root = document.getElementById('splash');
  const q = <T extends HTMLElement>(selector: string) => root?.querySelector<T>(selector) ?? null;
  const fill = q('.barra > span');
  const label = q('.etapa > span');
  const count = q('.etapa > b');
  const button = q<HTMLButtonElement>('button');
  const write = (selector: string) => (text: string) => {
    const el = q(selector);
    if (el) el.textContent = text;
  };
  let shown = 0;
  return {
    step(text, fraction, n = '') {
      // A barra nunca volta (as etapas têm pesos estimados).
      shown = Math.max(shown, Math.min(1, fraction));
      if (fill) fill.style.width = `${(shown * 100).toFixed(1)}%`;
      root?.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
      if (label) label.textContent = text;
      if (count) count.textContent = n;
    },
    lema: write('.lema'),
    dica: write('.dica'),
    versao: write('.versao'),
    skip(text, onClick) {
      if (!button) return;
      button.textContent = text;
      button.classList.add('visivel');
      button.onclick = () => {
        button.onclick = null;
        button.classList.remove('visivel');
        onClick();
      };
    },
    async close() {
      if (!root) return;
      root.classList.add('saindo');
      await new Promise((resolve) => setTimeout(resolve, 380));
      root.remove();
    },
  };
}
