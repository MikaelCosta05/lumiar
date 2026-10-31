// Curva personalizada dos keyframes, paleta de comandos (Ctrl+K) e bloco de ajuste
export default {
  // Curva personalizada
  Personalizada: 'Custom',
  'Desenhe a sua curva arrastando as alças': 'Draw your own curve by dragging the handles',
  'Arraste as duas alças. Acima da linha de cima, a animação passa do ponto e volta.': 'Drag the two handles. Above the top line, the animation overshoots and comes back.',
  'Começar de uma curva pronta': 'Start from a preset curve',
  'Começar de…': 'Start from…',
  'Valores da curva, como no cubic-bezier do CSS (x1, y1, x2, y2)': 'Curve values, like CSS cubic-bezier (x1, y1, x2, y2)',

  // Paleta de comandos
  'Buscar filtro, efeito, pacote ou ação': 'Search filter, effect, pack or action',
  'Buscar filtro, efeito, transição, pacote, sticker, som ou ação…': 'Search filter, effect, transition, pack, sticker, sound or action…',
  'Efeito sonoro': 'Sound effect',
  Ação: 'Action',
  '"{name}" não dá para fazer agora.': '"{name}" can\'t be done right now.',
  'Buscar filtro, efeito, pacote ou ação…': 'Search filter, effect, pack or action…',
  'Usados recentemente': 'Recently used',
  '↑ ↓ escolhe · Enter aplica no clipe selecionado ou no cursor · Esc fecha': '↑ ↓ choose · Enter applies to the selected clip or at the playhead · Esc closes',
  'Item selecionado': 'Selected item',

  // Bloco de ajuste
  'Bloco de ajuste': 'Adjustment block',
  'Um bloco vazio: escolha nele o filtro, os efeitos, a cor e a câmera. Vale para tudo o que está embaixo, só naquele trecho.':
    'An empty block: pick its filter, effects, color and camera. It applies to everything below it, only in that stretch.',
  'Bloco de ajuste na timeline. Escolha no painel da direita o filtro, os efeitos, a cor e a câmera.':
    'Adjustment block added. Pick the filter, effects, color and camera in the right panel.',
  'Vazio: você escolhe o filtro, os efeitos, a cor e a câmera': 'Empty: you pick the filter, effects, color and camera',
  'Bloco de ajuste aqui (filtro e efeitos para o que está embaixo)': 'Adjustment block here (filter and effects for what is below)',
  'Bloco de ajuste · {track}': 'Adjustment block · {track}',
  'Bloco de ajuste: escolha o filtro e a cor na aba Cor, os efeitos na aba Efeitos e o movimento na aba Câmera. Tudo vale para o que está embaixo do bloco, só neste trecho.':
    'Adjustment block: pick the filter and color in the Color tab, effects in the Effects tab and movement in the Camera tab. Everything applies to what is below the block, only in this stretch.',
} satisfies Record<string, string>;
