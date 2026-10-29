// Efeitos analógicos (fita VHS, TV de tubo) e a categoria nova: nome, descrição e controles.
export default {
  // Categoria
  'Analógico': 'Analog',
  // erro-de-tracking
  'Erro de tracking': 'Tracking error',
  'A faixa de chiado da fita mal ajustada: um bloco de linhas tortas e riscos brancos que sobe e desce pela tela.':
    'The noise bar of a badly tracked tape: a block of bent lines and white streaks that crawls up and down the screen.',
  'Altura da faixa': 'Bar height',
  'Riscos brancos': 'White streaks',
  // rolagem-vertical
  'Rolagem vertical': 'Vertical roll',
  'A TV perde o sincronismo vertical: a imagem rola para cima com a faixa preta entre um quadro e outro. Anime o deslocamento para uma rolada só.':
    'The TV loses vertical hold: the picture rolls up with the black bar between frames. Animate the shift for a single roll.',
  'Velocidade (voltas por segundo)': 'Speed (rolls per second)',
  'Faixa preta': 'Black bar',
  // troca-de-cabeca
  'Ruído da cabeça de vídeo': 'Head-switching noise',
  'A faixa torta e chiada no pé da imagem, onde a cabeça do videocassete troca de lado. O detalhe que faz qualquer vídeo parecer fita de verdade.':
    'The bent, noisy strip at the bottom of the picture where the VCR heads switch. The detail that makes any video look like real tape.',
  'Quanto entorta': 'Skew',
  'Chiado': 'Noise',
  // fita-amassada
  'Fita amassada': 'Wrinkled tape',
  'Fita velha e dobrada: de vez em quando passa uma faixa de imagem esmagada com cor de arco-íris, e riscos brancos (dropouts) piscam pela tela.':
    'Old, creased tape: every now and then a squashed, rainbow-colored band rolls by, and white streaks (dropouts) flash across the screen.',
  'Amassados': 'Wrinkles',
  'Riscos (dropouts)': 'Streaks (dropouts)',
  'Altura do amassado': 'Wrinkle height',
  // fantasma-de-imagem
  'Fantasma de imagem': 'Ghosting',
  'Sinal de antena ruim: cópias apagadas da imagem aparecem deslocadas para o lado, com um contorno claro nas bordas. Tudo parece ter um vulto.':
    'Bad antenna signal: faint copies of the picture show up shifted to the side, with a bright outline on the edges. Everything seems to have a shadow figure.',
  'Distância do fantasma': 'Ghost distance',
  'Contorno nas bordas': 'Edge ringing',
  // entrelacado
  'Entrelaçado': 'Interlacing',
  'Vídeo de TV antiga em campos: uma linha sim, outra não, vem do quadro anterior, e o que se mexe fica serrilhado (efeito pente). Funciona tocando.':
    'Old TV video in fields: every other line comes from the previous frame, so anything that moves gets jagged (combing). Works during playback.',
  'Espessura das linhas (px)': 'Line thickness (px)',
  'Desvio das linhas': 'Line offset',
  'Escurecer as linhas': 'Darken the lines',
  // sinal-fraco
  'Sinal fraco': 'Weak signal',
  'Antena longe da torre: a imagem perde cor e contraste, some num chuvisco que vai e volta e as linhas balançam e rasgam de lado.':
    'Antenna far from the tower: the picture loses color and contrast, fades in and out of snow, and the lines sway and tear sideways.',
  'Chuvisco': 'Snow',
  'Balanço das linhas': 'Line sway',
  // quadros-travando
  'Quadros travando': 'Stuttering frames',
  'O vídeo engasga: segura cada quadro um pouco e pula para o próximo, como gravação de câmera de vigilância, stop motion ou fita pulando. Funciona tocando.':
    'The video stutters: it holds each frame for a moment and jumps to the next, like surveillance footage, stop motion or a skipping tape. Works during playback.',
  'Quanto segura cada quadro (s)': 'How long each frame is held (s)',
  'Irregular (trechos que andam normal)': 'Irregular (stretches that play normally)',
  'Tranco ao pular': 'Jolt on each jump',
  // pausa-de-fita
  'Pausa de fita': 'Tape pause',
  'Aperta o pause do videocassete: a imagem congela tremendo entre duas linhas, com faixas de chiado. Sem chiado e sem tremor, vira um congelamento limpo. Funciona tocando.':
    'Hits pause on the VCR: the picture freezes, jittering between two lines, with noise bars. With no noise and no jitter, it becomes a clean freeze frame. Works during playback.',
  'Faixas de chiado': 'Noise bars',
  'Tremor da imagem parada': 'Frozen picture jitter',
  // cor-borrada-vhs
  'Cor borrada de VHS': 'VHS color smear',
  'A fita guarda a cor em baixa resolução: ela borra, escorre para a direita além das bordas e chia em manchas, enquanto o desenho fica só um pouco mole.':
    'Tape stores color at low resolution: it smears, bleeds to the right past the edges and crawls with blotchy noise, while the detail just gets a bit soft.',
  'Borrão da cor': 'Color smear',
  'Cor atrasada para a direita': 'Color delayed to the right',
  'Imagem mole': 'Soft picture',
  'Chiado de cor': 'Chroma noise',
  // oscilacao-de-brilho
  'Oscilação de brilho': 'Brightness flicker',
  'A luz não se decide: o brilho tremula, às vezes despenca por um instante, e uma faixa escura de interferência sobe devagar pela tela.':
    'The light can\'t make up its mind: brightness flickers, sometimes drops out for an instant, and a dark hum bar slowly creeps up the screen.',
  'Tremulação': 'Flicker',
  'Quedas de luz': 'Light dropouts',
  'Faixa de interferência': 'Hum bar',
  // rosto-deformado
  'Rosto deformado': 'Warped face',
  'O rosto estica, a boca alarga demais, os traços escorrem e tudo dá trancos: alguém que parece a pessoa, mas não é. Coloque o rosto no centro (os pacotes usam o seguir rosto).':
    'The face stretches, the mouth gets too wide, the features drip and everything twitches: someone who looks like the person, but isn\'t. Put the face in the center (the packs use follow face).',
  'Esticar para cima': 'Stretch upward',
  'Boca larga': 'Wide mouth',
  'Traços escorrendo': 'Dripping features',
  'Trancos': 'Twitches',
  'Centro do rosto': 'Face center',
  // tv-desligando
  'Desligar a TV': 'TV power-off',
  'Como uma TV de tubo: a imagem se espreme numa linha branca e some num ponto de luz. No modo ligar, faz o caminho de volta. Acontece sozinho no fim (ou no começo) do clipe.':
    'Like a CRT TV: the picture squeezes into a white line and vanishes into a dot of light. In power-on mode, it goes the other way. Happens on its own at the end (or start) of the clip.',
  'Modo (0 = desliga no fim, 1 = liga no começo)': 'Mode (0 = turns off at the end, 1 = turns on at the start)',
  'Brilho da linha': 'Line glow',
} satisfies Record<string, string>;
