// Selecionar qualquer objeto com um clique (menu do clipe, painel "Recorte", efeitos e mensagens do worker de IA).
export default {
  'Selecionar objeto…': 'Select object…',
  'o modelo de seleção de objetos': 'the object selection model',
  'Analisando o quadro': 'Analyzing the frame',
  'A imagem ainda não carregou. Tente de novo.': "The image hasn't loaded yet. Try again.",
  'Cancelado.': 'Canceled.',
  'Seguindo o objeto no clipe… {n}%': 'Following the object through the clip… {n}%',
  'Não foi possível ler esse quadro: {error}': "Couldn't read that frame: {error}",
  'A IA não conseguiu selecionar: {error}': "The AI couldn't make the selection: {error}",
  'Objeto selecionado ({n} quadro(s)). Os efeitos de pessoa deste clipe agora usam o objeto: fundo, contorno, recorte, texto atrás… Troque em Recorte, no painel do clipe.':
    'Object selected ({n} frame(s)). This clip\'s person effects now use the object: background, outline, cutout, text behind… Switch it under Cutout, in the clip panel.',
  'Seleção de objeto cancelada.': 'Object selection canceled.',
  'Abrindo o quadro…': 'Opening the frame…',
  'Seguindo o objeto pelo clipe…': 'Following the object through the clip…',
  '{n} ponto(s) · clique marca o objeto, botão direito marca o que não é': '{n} point(s) · click marks the object, right-click marks what isn\'t',
  'Clique no objeto que você quer selecionar': 'Click the object you want to select',
  'Desfazer ponto': 'Undo point',
  Aplicar: 'Apply',
  'recorte|Recorte': 'Cutout',
  'Pessoa (automático)': 'Person (automatic)',
  'A IA encontra a pessoa em cada quadro': 'AI finds the person in every frame',
  'Objeto selecionado': 'Selected object',
  'Um objeto que você escolhe com cliques': 'An object you pick with clicks',
  'Selecionar de novo…': 'Select again…',
  'Apagar a seleção': 'Delete the selection',
  'Vale para tudo que usa a pessoa: o fundo acima, contorno, recortar, texto atrás e os efeitos "Desfocar o objeto" e "Apagar o objeto".':
    'Applies to everything that uses the person: the background above, outline, cut out, text behind and the "Blur the object" and "Erase the object" effects.',
  // Efeitos que usam o objeto selecionado
  'Desfocar o objeto': 'Blur the object',
  'Desfoca ou pixela exatamente o objeto escolhido, seguindo ele pelo clipe: clique direito no clipe → Selecionar objeto…. Sem objeto selecionado, vale para a pessoa.':
    'Blurs or pixelates exactly the chosen object, following it through the clip: right-click the clip → Select object…. With no object selected, it applies to the person.',
  'Margem em volta do objeto': 'Margin around the object',
  'Apagar o objeto': 'Erase the object',
  'Some com o objeto escolhido (clique direito no clipe → Selecionar objeto…): o lugar dele é preenchido com as cores de volta, quadro a quadro, mesmo quando ele se mexe. Funciona melhor com objetos pequenos em fundo simples.':
    'Gets rid of the chosen object (right-click the clip → Select object…): its spot is filled in with the surrounding colors, frame by frame, even when it moves. Works best with small objects on a simple background.',
} satisfies Record<string, string>;
