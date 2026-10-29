<div align="center">

<img src="electron/icon.png" width="96" alt="Ícone do Lumiar">

# Lumiar

**Editor de vídeo para computador, feito para quem gosta de efeito, transição e filtro.**
Roda no Windows, no Linux e no macOS, e tudo (inclusive legendas automáticas e voz sintética) funciona sem internet.
A interface está em português, inglês e espanhol ([como traduzir](docs/TRADUCAO.md)).

[**Baixar para Windows**](https://github.com/MikaelCosta05/lumiar/releases/latest) ·
[**Baixar para Linux**](https://github.com/MikaelCosta05/lumiar/releases/latest) ·
[**Baixar para macOS**](https://github.com/MikaelCosta05/lumiar/releases/latest) ·
[Rodar pelo código](#rodando-pelo-código)

<br>

![O editor com um vídeo, um título, uma sobreposição e legendas](docs/screenshots/editor.jpg)

</div>

---

Comecei o Lumiar porque queria um editor no estilo do Filmora em que eu pudesse inventar os meus próprios
efeitos e transições. Hoje ele vem com **160 filtros, 70 transições, 88 efeitos, 260 pacotes de edição, 59 stickers, 10 elementos animados e 34 efeitos sonoros prontos**. Cada filtro, efeito e transição é só uma
pastinha com um shader. Se você souber um pouco de GLSL, dá para criar o seu em minutos: direto no programa, pelo
**Editor de efeitos** (Ferramentas), ou no código ([guia aqui](docs/PLUGINS.md)).

Tudo é processado na placa de vídeo (WebGL2), então o preview mostra exatamente o que vai sair no arquivo final.

## O que dá para fazer

### Linha do tempo

- Uma trilha principal magnética (os clipes se encaixam sozinhos) e quantas **trilhas de vídeo, áudio e texto**
  você quiser por cima.
- Puxe as bordas para cortar, aperte **S** para dividir no cursor, arraste entre trilhas. O ímã gruda nas bordas
  dos outros clipes e nos marcadores.
- **Clique direito em qualquer coisa** abre o menu daquilo: duplicar, copiar e colar, mudar a velocidade,
  separar o áudio, congelar o quadro, inverter o clipe, copiar o filtro de um clipe para outro…

![Menu do clique direito com o submenu de velocidade](docs/screenshots/menu.jpg)

- **Picture-in-picture**: coloque um vídeo por cima de outro, arraste ele direto no preview, arredonde os cantos,
  mude a opacidade ou o modo de mesclagem. Tem também **chroma key** para apagar fundo verde.
- **Formas (máscaras)**: recorte a sobreposição num círculo, retângulo, coração, estrela ou losango, com borda suave
  e opção de inverter (mostrar só o lado de fora).
- **Máscara desenhada à mão** (✎ na Forma da camada): clique no vídeo para pôr os pontos, arraste para mover e use o
  botão direito para apagar. Com *Animar a forma*, cada ajuste vira um keyframe e a forma acompanha o movimento.
- **Remover o fundo sem tela verde**: a IA separa a pessoa do resto em cada quadro, no seu computador. Dá para
  desfocar só o fundo (modo retrato), trocar por uma cor ou, numa trilha de cima, recortar a pessoa e pôr por cima
  de outro vídeo.
- **Selecionar qualquer objeto com um clique**: clique direito no clipe → *Selecionar objeto…*. Clique no objeto
  (botão direito marca o que não faz parte) e a IA mostra a seleção na hora; *Aplicar* segue o objeto pelo clipe
  todo. Em *Recorte* (painel do clipe), troque entre a pessoa (automático) e o objeto selecionado: o fundo, o
  contorno, recortar, o texto atrás e os efeitos *Desfocar o objeto* e *Apagar o objeto* passam a usar o objeto. O
  modelo (SlimSAM) é baixado na primeira vez; a seleção fica salva no projeto.
- **Mover o resto junto** (🔗 na barra da timeline, ligado por padrão): ao cortar ou excluir na trilha principal,
  textos, áudios, sobreposições, pacotes, marcadores e legendas andam junto e continuam sincronizados.
- **Marcadores** (tecla **M**) para anotar pontos importantes, e **Ctrl + ← / →** pula entre cortes.
- Desfazer e refazer (até 200 passos), salvamento automático e um arquivo `.lumiar` que guarda o projeto e as mídias juntos.
- **Histórico** (ícone de relógio no topo): a lista do que foi feito nesta sessão, para voltar direto a um ponto, e as
  **cópias de segurança** que o Lumiar guarda sozinho a cada 5 minutos de edição (as 15 mais recentes).
- **Agrupar**: clique direito num texto, som, sobreposição ou pacote → *Agrupar com o que está neste trecho*. Arrastar
  um item do grupo leva os outros junto.
- **Selecionar vários itens**: Ctrl (ou Shift) + clique, ou arraste um retângulo na área vazia da timeline. Os
  selecionados andam juntos, saem juntos com Delete, recebem juntos o filtro ou efeito clicado na biblioteca e podem
  virar um grupo pelo clique direito.
- **Comentários e tarefas**: clique direito na timeline → *Adicionar comentário aqui* ("trocar essa música", "cortar
  aqui"). Os balões ficam na régua; marcar como feito deixa o balão verde. A lista toda fica em Ferramentas.
- **Medidor de ritmo** (ícone de velocímetro na barra da timeline): uma faixa na régua marca os trechos com 7 s ou mais
  sem nada mudando na tela (corte, zoom, texto, camada), onde quem assiste costuma desistir.
- **Atalhos de editor profissional**: J/K/L para tocar para trás, pausar e para frente (apertando de novo, 2× e 4×),
  Q/W para cortar do começo do clipe até o cursor ou do cursor até o fim, e Alt+arrastar para duplicar.
- **Slip, slide e roll** (seletor na barra da timeline, ou as teclas Y, U e N; V volta para a seleção): o *slip*
  troca o trecho mostrado dentro do clipe sem mudar o lugar nem o tamanho (vale também para sobreposições e áudios);
  o *slide* move um clipe da trilha principal entre os vizinhos, que se ajustam; o *roll* arrasta o corte entre dois
  clipes, um cresce e o outro diminui. Slide e roll não mudam a duração total, e durante o arrasto uma dica mostra os
  novos pontos de entrada e saída com os quadros dos dois lados.

### Filtros, efeitos e transições

As bibliotecas são organizadas em linhas por categoria, cada uma com um "Ver todos". Passe o mouse em cima de
uma miniatura e ela mostra o efeito animado. Para aplicar, é só clicar com o clipe selecionado ou arrastar até a timeline.

![Biblioteca de filtros e o painel de cor do clipe](docs/screenshots/filtros.jpg)

- **Filtros**: retrato (pele suave, brilho dourado), preto e branco, filmes antigos (Kodachrome, Portra, Cinestill),
  retrô (VHS, Polaroid) e ferramentas de correção (nitidez, restaurar, exposição e branco automáticos).
  Todos têm controle de intensidade.
- **Efeitos**: glitch, VHS, pintura a óleo, aquarela, arte ASCII, câmera térmica, chuva, neve, partículas,
  lente olho de peixe e muito mais. Dá para empilhar vários no mesmo clipe.
- **Transições**: das clássicas (dissolver, cortina) às de impacto, como onda de choque, vidro quebrado,
  terremoto, zoom de tensão e câmera de vídeo.

![Biblioteca de transições na linha "Em alta"](docs/screenshots/transicoes.jpg)

**Efeitos na pessoa** (categoria *Pessoa*): a IA encontra a pessoa em cada quadro, sem tela verde.

- **Contorno brilhante**: uma linha neon acompanha o corpo, pulsando ou trocando de cor.
- **Clones**: a mesma pessoa 2 a 4 vezes na tela, cada cópia um pouco atrasada, em fila ou no mesmo lugar.
- **Desintegrar**: a pessoa vira poeira e voa com o vento (o estalo do Thanos), ou se forma a partir dela.
- **Rastro da pessoa**: só ela deixa cópias transparentes e coloridas para trás; o fundo continua limpo.
- **Congelar a pessoa**: ela para no meio do pulo e o mundo continua, ou o mundo congela e só ela se mexe.
- **Sair da moldura**: o vídeo vira um quadro menor, inclinado, e a pessoa salta para fora da borda.
- **Rabiscos animados**: contorno desenhado à mão, tremendo, com estrelinhas, corações e brilhos em volta.
- **Texto atrás da pessoa**: na aba Posição do texto (ou no clique direito), *Atrás da pessoa* põe o título entre
  ela e o fundo.

**Efeitos com o tempo** (categoria *Tempo*): usam os quadros anteriores, então aparecem tocando o vídeo.

- **Time warp scan**: uma linha atravessa a tela congelando o que fica para trás (o filtro que estica rostos).
- **Datamosh**: os pixels não se renovam e a imagem escorre junto com o movimento. Também existe como transição: o
  clipe atual escorre pelo movimento do próximo.
- **Eco temporal / estroboscópio**: rastros de luz do movimento, ou cópias nítidas da pessoa em intervalos.

**Efeitos com profundidade** (categoria *Profundidade*): a mesma IA da Foto 3D, agora no vídeo.

- **Trocar o céu**: pôr do sol, noite estrelada, aurora ou céu azul, com a luz da cena acompanhando.
- **Foco que muda**: o desfoque passa da frente para o fundo como numa lente de cinema.
- **Neblina e luz no fundo**: névoa e raios de luz só atrás da pessoa; o que está perto continua nítido.

E duas transições novas: **Pela silhueta** (o próximo clipe aparece dentro do corpo da pessoa e cresce até tomar
a tela) e **Zoom infinito** (a câmera entra num ponto da imagem e sai no próximo clipe).

- **Keyframes** em qualquer parâmetro: marque um valor num ponto e outro mais à frente, e o Lumiar anima entre os dois.
- **Correção de cor manual**, na aba Cor do clipe: rodas de sombras, meios-tons e altas luzes, saturação e curvas
  (geral, vermelho, verde e azul).
- **LUTs (.cube)**: importe os arquivos de cor usados no Premiere, DaVinci e Final Cut e aplique com intensidade.
  A LUT fica salva no projeto.
- **Desfocar área**: efeito para esconder placas, rostos e telas, com desfoque ou pixels.
- **Desfocar rostos automaticamente**: clique direito no clipe → *Desfocar rostos automaticamente…*. O Lumiar acha
  todos os rostos, mostra cada um numa miniatura para você escolher quais esconder, e o desfoque acompanha cada rosto
  enquanto ele se mexe (some quando o rosto sai de cena).
- **Apagar objeto**: efeito que some com um poste, uma pessoa no fundo ou um logo, preenchendo a área com as cores de
  volta. Se o objeto se mexe, clique direito no clipe → *Fazer o apagador seguir o objeto*. Funciona melhor em
  objetos pequenos sobre fundos simples (céu, parede, chão).
- **Melhorar imagem**: para vídeo escuro, granulado ou sem nitidez (celular à noite, webcam): clareia as sombras sem
  estourar o claro, tira o granulado e devolve a nitidez.
- **Gráficos de cor** (botão *Gráficos* embaixo do vídeo): histograma, forma de onda e vetorscópio do quadro atual,
  com a linha de tom de pele, para acertar exposição e cor com precisão.
- **Igualar a cor**: clique direito num clipe → *Igualar a cor com…* e escolha o clipe de referência (câmeras
  diferentes, luz que mudou). O ajuste vira curvas na correção manual.
- **Curvas de animação**: em cima de um keyframe, o botão de curva escolhe como ele chega no próximo (suave, linear,
  acelerando, freando, passando do ponto e voltando, elástico, quicando).

### Pacotes de edição

Pacotes são edições prontas que juntam filtro, efeitos e movimento de câmera, sem textos nem stickers. Ao aplicar um
pacote, ele vira um bloco numa trilha própria e vale para tudo o que está embaixo dele, só naquele trecho. Você
arrasta o bloco para o ponto certo e puxa as bordas para encaixar. As animações de entrada e saída se ajustam
sozinhas ao novo tamanho.

![Pacote "Trailer épico" sobre a entrevista, com uma "Batida" mais à frente](docs/screenshots/pacotes.jpg)

São 260 pacotes em 18 categorias. Alguns fazem bem mais do que mudar a cor:

- **Terror analógico** (21): o clima das fitas amaldiçoadas e das transmissões que não deviam estar no ar. Fita VHS
  doente e mofada, erro de tracking, imagem rolando na vertical, ruído da cabeça de vídeo, fantasma, quadros travando,
  pausa de fita, transmissão de emergência, câmera de vigilância, visão noturna, luz de lanterna e o zoom súbito no rosto.

- **Batidas da música**: o Lumiar ouve a música, encontra as batidas (e o BPM) e o pacote pulsa em cada uma, com
  zoom, flash, tremida, giro, P&B, estrobo, cores alternadas… As batidas ficam marcadas na régua e servem de ímã para
  os seus cortes. Os pacotes curtos (flash, glitch, soco de zoom) também podem ser repetidos em cada batida.
- **Seguir rosto**: o pacote procura o rosto no vídeo embaixo dele e a câmera acompanha a pessoa. Exemplos: close
  no rosto, aproximação lenta, entrevista que alterna entre plano aberto e fechado.
- **Câmera lenta e velocidade**: o pacote muda a velocidade do clipe naquele trecho. Tem câmera lenta fluida, rampas
  que freiam e aceleram, bullet time, timelapse e avanço rápido estilo VHS.
- **Edits virais**: velocity, glow edit, edit de carro, edit de anime, drop, POV…
- **Comédia e memes** (50): zoom dramático no rosto, olhar pra câmera, zoom triplo, vine boom, meme frito, silêncio
  constrangedor, "e foi aí que…", plot twist, cringe, "enquanto isso…"… Vários usam câmera lenta: queda épica,
  "esse sou eu" (quase congela no meio da confusão), "não acredito", "quaaase", vitória épica, câmera lenta
  desnecessária, tropeço. Outros aceleram, como o filme mudo e a perseguição acelerada.
- **Câmera em movimento**: câmera na mão, crash zoom, órbita, ângulo holandês, travelling, pêndulo, drone…
- **Cinematográfico**, **Impacto e ritmo**, **Passagens no corte**, **Aberturas e finais**, **Vlog**, **Retrô**,
  **Sonho e romance**, **Suspense e terror**, **Ação e games**, **Documentário e notícia** e **Clima e estações**.

Os pacotes não trazem som, texto nem sticker: isso fica nas abas **Sons**, **Textos** e **Stickers**, para pôr só onde
você quiser. Nos pacotes de câmera lenta, o trecho lento pode ficar mudo.

Nos pacotes de **câmera lenta**, uma linha branca com ◆ no bloco marca o momento (o começo da parte mais lenta).
Arraste essa alça até o instante exato do tombo ou do susto e o vídeo é refeito ali. Arrastar o bloco inteiro também
leva a câmera lenta junto, e excluir o bloco devolve o vídeo à velocidade normal.

Cada pacote sabe onde entrar:

- Os de **visual** cobrem o clipe selecionado.
- Os **momentos** (batida, impacto, câmera lenta) começam no cursor.
- As **passagens** ficam centralizadas no corte mais próximo.
- As **aberturas** e os **finais** encostam no começo ou no fim do clipe.
- Os de **batida** cobrem a música inteira (ou o clipe selecionado).

No painel da direita dá para baixar a intensidade, suavizar a entrada e a saída, ligar e desligar cada efeito ou
trocar o filtro, sem mexer no pacote original.

Também dá para trabalhar como numa action do Photoshop:

- **Fixar direto no clipe** (botão direito no pacote) grava o filtro, os efeitos e a câmera do pacote no próprio clipe.
- **Salvar como meu pacote** guarda um bloco ajustado, ou o visual de um clipe, em "Meus pacotes" para usar de novo
  em outros projetos. A câmera lenta do bloco vai junto.
- Os botões no topo da aba exportam "Meus pacotes" para um arquivo `.lumiarpack` e importam de volta, para levar a
  outro computador ou mandar para alguém.

### Stickers e efeitos sonoros

- **Stickers**: 59 emojis grandes e animados (😂 💀 🔥 👀 🤯 👉 ⭕ ❌ ✅ 🏆…), que quicam, tremem, giram, pulsam ou
  apontam. Funcionam como um texto: dá para arrastar no vídeo, mudar o tamanho e trocar a animação.
- **Efeitos sonoros**: 34 sons gerados pelo próprio Lumiar, sem baixar nada: vine boom, trombone triste, grilos,
  ba-dum-tss, boing, disco arranhado, bip de censura, aplausos, whoosh, impacto, boom de cinema, "entrando em câmera
  lenta", coração batendo, dun dun duuun, moeda, vitória, sino de luta… Clique em ▶ para ouvir e no nome para pôr no
  cursor. Eles vão para a trilha "Efeitos sonoros".

### Edição rápida

- **Montar pelo roteiro**: gravou cada frase várias vezes? Com o roteiro escrito (aba Voz) e o vídeo transcrito, o
  botão *Montar pelo roteiro* (aba Texto) acha as tentativas de cada frase, fica com a melhor (normalmente a última
  que saiu completa) e tira os erros, as repetições e a conversa no meio. Dá para trocar de tentativa antes de montar.
- **Gancho de abertura** (Ferramentas): o Lumiar acha os momentos mais fortes do vídeo e copia o escolhido para os
  primeiros segundos, como prévia, com um flash antes do vídeo começar de verdade.
- **Dividir nas mudanças de cena**: clique direito num vídeo longo (ou que já veio editado) e ele é cortado em cada
  troca de plano.
- **Imagens de apoio automáticas** (Ferramentas): enquanto você fala "a praia estava linda", entra por cima um trecho
  das suas mídias que mostra uma praia. Você confere a lista e desmarca o que não combinar.
- **Buscar nas mídias** (Ferramentas): ache o momento exato pelo que aparece ("cachorro", "pôr do sol", "carro
  vermelho") ou pelo que é falado, em todas as mídias do projeto, mesmo as que ainda não estão na timeline.
- **Cortar as pausas**: clique direito num clipe → *Cortar as pausas (silêncios)*. O Lumiar ouve o áudio, encontra
  os silêncios (o limite se ajusta ao ruído de fundo de cada vídeo) e tira todos, deixando uma folguinha antes e
  depois de cada fala. Ótimo para vlog, aula e podcast.
- **Sincronizar o áudio pela forma de onda**: gravou com um microfone separado? Clique direito no áudio → *Sincronizar
  com o vídeo (pelo som)* e ele se encaixa sozinho; o som da câmera fica mudo.
- **Multicâmera**: ponha as outras câmeras nas trilhas de vídeo de cima e use *Multicâmera: sincronizar as câmeras pelo
  som*. Depois, tocando o vídeo, aperte 1, 2, 3… para cortar entre as câmeras (1 = trilha principal).
- **Multicâmera automática**: *Multicâmera: cortar sozinho para quem fala* descobre quem está falando (pelo som de cada
  câmera, ou pelas vozes separadas nas legendas) e corta para a câmera daquela pessoa. Bom para podcast e entrevista.
- **Zoom automático na fala**: o Lumiar acha os momentos de ênfase (fala mais alta) e dá um zoom rápido em cada um,
  como fazem os youtubers. Cada zoom é um bloco que dá para mover ou apagar.
- **Destaques para Shorts e Reels**: em vídeos longos, o Lumiar sugere os trechos mais animados (30, 45 ou 60 s) e
  exporta cada um em 9:16.
- **Capítulos para o YouTube**: a partir dos marcadores (ou da fala transcrita), a lista "00:00 …" pronta para colar
  na descrição.
- **Encaixar a música na duração**: clique direito na música → *Encaixar a música na duração* (até o fim do vídeo,
  15, 30 ou 60 s). Em vez de cortar o final no meio de uma frase musical, o Lumiar tira (ou repete) um pedaço do meio,
  emendando em cima das batidas onde o som é parecido. O começo e o final de verdade da música ficam.
- **Montar no ritmo**: clique direito na música → *Montar os clipes no ritmo*. Cada clipe passa a durar 1, 2 ou 4
  batidas e os cortes caem exatamente em cima delas. Também dá para repetir os clipes (pegando outros trechos dos
  vídeos) até o fim da música.
- **Converter para vertical**: o botão 📱 ao lado do formato deixa o projeto em 9:16 (Reels, TikTok, Shorts) e cada
  clipe passa a acompanhar o rosto de quem aparece.
- **Prévia leve**: o botão embaixo do vídeo cria cópias em 540p dos vídeos pesados (4K, 1080p) só para editar. Tocar
  e pular na timeline fica muito mais rápido; a exportação continua usando os arquivos originais.
- **Pré-renderizar trecho**: efeitos pesados (na pessoa, com profundidade, datamosh, clones…) engasgam o preview? Clique
  direito no clipe (ou na régua) → *Pré-renderizar este trecho*. O Lumiar renderiza aquele pedaço uma vez, em 720p, e o
  preview passa a tocar dele, liso; uma faixa verde na régua mostra onde. Mexeu no trecho, ele volta a ser renderizado
  ao vivo até você pré-renderizar de novo. Fica só na memória (até 1,5 GB; os mais antigos saem primeiro).
- As prévias dos filtros, efeitos e pacotes (ao passar o mouse) mostram o **clipe selecionado**.

### Editar pelo texto

Na aba **Texto**, o Lumiar transcreve a fala do vídeo e mostra como um texto. Selecione palavras e aperte Delete: o
trecho sai do vídeo e todo o resto anda junto. Clicar numa palavra leva o cursor até ela.

O botão **Tirar vícios** encontra e remove de uma vez as hesitações ("é…", "hum", "ahn"), as muletas soltas ("tipo,",
"né?", "então…", "sabe?"), as palavras repetidas ("eu eu") e as frases recomeçadas ("eu fui, eu fui no mercado").
Em **Revisar um por um**, cada vício aparece numa lista para ouvir e desmarcar o que deve ficar.

### Câmera e velocidade

- Movimentos de câmera prontos (Ken Burns, panorâmica, zoom de impacto, drone, vertigem…) ou feitos à mão com keyframes.
- **Seguir rosto**: o editor encontra o rosto em cada quadro e mantém a pessoa enquadrada.
- **Seguir ponto**: clique em qualquer coisa no vídeo e a câmera acompanha.
- **Estabilizar vídeo tremido**: clique direito no clipe → *Estabilizar vídeo* (suave, média ou forte). O Lumiar mede
  o tremido quadro a quadro e a câmera compensa, com um zoom leve (no máximo 1,25×) para esconder as bordas. Soma com
  os keyframes e o "seguir rosto" que o clipe já tiver.
- **Texto e sticker que seguem algo**: na aba Posição do texto, escolha um ponto no vídeo e o texto (ou um 👉)
  gruda nele e anda junto.
- **Câmera lenta fluida**: abaixo de 1× o Lumiar cria os quadros que faltam estimando o movimento, em vez de repetir quadros.
- **Curva de velocidade**: na aba Velocidade, desenhe a rampa (lento no meio, freia até parar, bullet time…) e o
  clipe ganha uma aceleração e uma freada suaves.
- Girar 90°, espelhar, congelar quadro e tocar de trás para frente.

### Textos e legendas

- **Elementos animados** (aba Stickers): barra de progresso do vídeo, botão "inscreva-se" com a mãozinha e o sino,
  contagem regressiva, seta e círculo que se desenham e balão de fala.
- **Rota animada no mapa**: escolha as cidades (148 no Brasil e no mundo) e uma linha anima de uma até a outra, com
  avião, carro ou navio na ponta e o nome de cada cidade aparecendo quando é alcançada. Temas escuro, claro e papel antigo.
- **Ondas de som**: barras, espelho, círculo ou linha que pulam com o som do projeto. Com uma imagem de fundo e as
  legendas, transforma um podcast só de áudio em vídeo para o Instagram e o YouTube.
- **Digitação animada** (aba Textos): código aparecendo letra por letra numa janela de editor, com as cores de
  código e o cursor piscando, um terminal ou só o texto. Velocidade ajustável.
- 34 estilos de título prontos (neon, cinema, 8-bit, máquina de escrever, código digitando, faixa de nome…), 10 fontes e animações
  de entrada, saída e contínuas.
- **Legendas automáticas** com o Whisper, rodando no seu computador: cada palavra ganha o seu tempo e dá para usar
  estilos como o "destaque" do TikTok, em que a palavra falada muda de cor. Também importa e exporta `.srt` e `.vtt`.
- **Legendas traduzidas para o inglês**: o Whisper ouve em português (ou outro idioma) e escreve em inglês.
- **Legendas em outros idiomas** (aba Legendas → Outros idiomas): traduz para inglês, espanhol, francês, italiano ou
  português e baixa um .srt por idioma (para enviar ao YouTube), ou troca as legendas da tela.
- **Legendas com cor por pessoa**: na aba Legendas, *Separar as vozes* reconhece quem fala em cada legenda (pelo
  timbre e pela altura da voz, de 2 a 4 pessoas) e dá uma cor e um nome a cada uma, que pode aparecer acima da legenda.

### Voz: narração e dublagem

- **Grave a narração** com o vídeo tocando junto. Você escolhe o microfone, testa o volume, tem contagem regressiva
  e um **teleprompter** que rola o seu roteiro por cima do vídeo. Com *Acompanhar a minha voz*, ele só anda enquanto
  você fala: parou para respirar ou pensar, o texto espera.
- **Dublagem**: selecione um clipe e grave por cima dele, no tempo certo. A gravação para sozinha no fim do clipe.

![Gravando a narração com o teleprompter na tela](docs/screenshots/voz.jpg)

- **Voz sintética** em português, inglês e espanhol, gerada sem internet. Dá até para dublar automaticamente todas as legendas.
- **Efeitos de voz**: voz limpa (estilo podcast), telefone, rádio, megafone, eco, caverna, robô, debaixo d'água,
  monstro e esquilo.
- A música **abaixa sozinha** enquanto alguém fala e volta depois.
- **Dublar o vídeo em inglês** (aba Voz): o Whisper ouve a fala, traduz e a voz sintética em inglês fala cada frase no
  mesmo instante (acelerando um pouco quando não cabe); o som original fica baixinho por baixo.
- **Limpar o áudio**: tira chiado, ventilador, ar-condicionado e ronco de fundo (leve, médio ou forte). Cria uma cópia
  limpa; o arquivo original fica intacto.
- **Equalizador** de graves, médios e agudos, com atalhos como "voz mais clara" e "tirar chiado".
- **Separar a voz da música**: clique direito no áudio (ou no vídeo) → *Separar a voz da música*. A voz vai para a
  trilha de narração e o resto (música, fundo) para uma trilha de música, para baixar, silenciar ou trocar cada parte.
- **Volume por trecho**: dois cliques no áudio na timeline criam pontos numa linha amarela; arraste para subir ou
  descer o volume só naquela parte.
- **Mixer de áudio** (ícone de controles deslizantes na barra da timeline): um canal para o som da trilha principal,
  um para cada trilha de vídeo com som e um para cada trilha de áudio (narração, música, efeitos sonoros…), mais o
  Master. Cada canal tem fader em dB (de −∞ a +6), pan, mudo (o mesmo botão do cabeçalho da trilha), solo (**S**,
  também no cabeçalho: com algum solo ligado, só os canais em solo tocam) e um medidor de pico e RMS enquanto o vídeo
  toca. O Master mostra o pico e a sonoridade dos últimos 3 s em LUFS. Os ajustes ficam no projeto e saem iguais na
  exportação (se o volume no padrão das plataformas estiver ligado, ele ajusta o total depois do Master).

### Gravar a tela

O botão **Gravar a tela** (aba Mídia) grava a tela com o microfone e o som do computador (no Windows), e a webcam
junto. Ao parar, a gravação entra na timeline com a webcam já num cantinho, sincronizada. Ótimo para tutoriais e gameplay.

No programa instalado, o Lumiar também anota por onde o mouse andou:

- **Zoom que segue o mouse**: a câmera se aproxima suavemente de onde você clica, acompanha o mouse enquanto você mexe
  por ali e volta para a tela inteira depois. Os cliques são detectados no Windows; no Linux e no Mac, ele usa os
  lugares onde o mouse para. Os zooms viram keyframes da câmera (dá para ajustar ou refazer pelo clique direito no clipe).
- **Destaque do cursor**: um círculo suave em volta do mouse e uma onda a cada clique.
- **Roteiro numa janelinha**: o teleprompter abre numa janela que fica por cima de tudo, acompanhando a sua voz.

### Fotos

- **Foto 3D**: clique direito numa foto na timeline → *Foto 3D*. A IA estima a profundidade da cena e a câmera entra
  na foto, desliza de lado ou gira em volta, com o que está perto se mexendo mais que o fundo. O clipe vira um vídeo
  (a foto original continua nas mídias).
- **Aumentar a resolução** (IA, 2×): para fotos pequenas ou antigas; os detalhes são recriados em vez de só esticados.

### Modelos de projeto e capa

- **Modelos** (ícone ao lado de "Novo projeto"): Reels de receita, vlog de viagem, review de produto, antes e depois,
  top 5 e homenagem com fotos. Vêm com as cenas, os títulos, as transições e a cor; cada cena é um espaço numerado.
  Clique direito nele → **Trocar a mídia** e o seu vídeo ocupa o mesmo tempo.
- **Projeto de exemplo**: na primeira vez que o Lumiar abre, o botão *Abrir projeto de exemplo* monta um vídeo de uns
  24 s com as fotos e o vídeo das prévias (do Pexels), com filtros, transições, título, um pacote, marcadores e comentários
  com dicas na régua. Depois ele fica em Ferramentas → *Abrir projeto de exemplo*.
- **Criar capa** (ícone ao lado de Exportar): monta a thumbnail do YouTube (ou a capa do Reels) a partir do quadro
  atual, com título grande de contorno grosso, a pessoa destacada com um contorno colorido, fundo escurecido e um
  sticker. Baixa em PNG ou copia.

### Ferramentas

O botão **Ferramentas**, no topo, reúne:

- **Tela dividida**: 2 lado a lado, em cima e embaixo, 3 colunas, um grande e dois, grade de 4… Escolha (ou arraste do
  computador) o que vai em cada quadro, o espaço e a cor entre eles. Cada quadro vira uma camada recortada para
  preencher o espaço; só o primeiro vídeo fica com som.
- **Clipe composto**: junta um trecho (trilha principal e tudo o que está por cima dele) num clipe só, que recebe um
  efeito, um filtro ou uma velocidade de uma vez. Clique direito → *Abrir o clipe composto* para mexer por dentro; ao
  clicar em *Voltar ao projeto*, ele é montado de novo.
- **Kit da marca**: logo, cores, fontes, abertura, encerramento e marca d'água, guardados uma vez neste computador e
  aplicados em qualquer projeto com um clique.
- **Editor de efeitos**: escreva o seu efeito em GLSL e veja o resultado na hora, com os erros apontados na linha
  certa. Os parâmetros que você define viram controles (com keyframes) no painel do clipe, e o efeito fica em
  Efeitos → *Meus efeitos*.
- **Galeria da comunidade**: efeitos e pacotes feitos por outras pessoas, com busca e etiquetas. **Instalar** baixa o
  arquivo, confere se ele é exatamente o publicado (SHA-256) e importa para "Meus efeitos" ou "Meus pacotes". Também
  abre pelo ícone de loja no topo das abas Efeitos e Pacotes. Para mandar o seu: [como funciona a galeria](docs/GALERIA.md).
- **Levar para Premiere, DaVinci ou Final Cut**: salva a edição em XML (formato do Final Cut 7, que os três importam)
  e EDL, numa pasta junto com as mídias. Também abre um XML ou EDL vindo deles. Vão os cortes e as posições de todas
  as trilhas; efeitos, filtros, textos e transições do Lumiar ficam de fora.
- **Processar vários vídeos**: a mesma receita para uma lista de vídeos (cortar as pausas, legendar, aplicar a marca,
  deixar vertical), exportando cada um em MP4 para uma pasta.
- **Mídias do projeto**: quanto cada mídia ocupa, o que está sem uso ou repetido (para tirar de uma vez) e **trocar o
  arquivo** de uma mídia por outro (uma versão melhor, por exemplo) sem perder os cortes e efeitos.

### Formatos e exportação

Mais de 25 formatos prontos: YouTube, Reels/TikTok/Shorts, feed do Instagram, quadrado, cinema 21:9 e 2.39:1,
até 4K, ou qualquer tamanho personalizado. Quando o vídeo não preenche a tela (um vídeo deitado num projeto vertical,
por exemplo), as bordas podem ficar pretas, de uma cor ou com a própria imagem desfocada.

<table>
  <tr>
    <td><img src="docs/screenshots/formato.jpg" alt="Escolha do formato do projeto"></td>
    <td><img src="docs/screenshots/vertical.jpg" alt="Projeto vertical com fundo desfocado"></td>
  </tr>
</table>

Na hora de exportar: **MP4, WebM, MOV, GIF animado** ou só o áudio em **WAV/M4A**, de 240p a 8K, de 12 a 60 fps,
em quatro níveis de qualidade. Em **Volume**, o som do vídeo inteiro pode sair no padrão das plataformas (-14 LUFS
para YouTube, Instagram, TikTok e Spotify; -16 para podcast; -23 para TV), com os picos abaixo de -1 dB: não sai baixo
nem é abaixado (e distorcido) pela plataforma. Dá para exportar só um trecho ou salvar o quadro atual como imagem.
Em **Exportar em vários formatos de uma vez**, marque YouTube (16:9), Reels/TikTok/Shorts (9:16), feed (4:5),
quadrado e um GIF curto, e o Lumiar gera todos em sequência. Durante a exportação, **Continuar editando** fecha a
janela e o progresso fica num cantinho da tela; novas exportações entram na fila.

![Janela de exportação](docs/screenshots/exportar.jpg)

## Instalando

Os instaladores ficam na página de [**Releases**](https://github.com/MikaelCosta05/lumiar/releases/latest).

**Windows (10 ou 11, 64 bits)**
Baixe o `Lumiar-…-Windows-Setup.exe` e abra. Como o instalador não tem assinatura digital, o Windows pode mostrar
"O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.

**Linux (64 bits)**
No Ubuntu, Debian, Mint, Pop!_OS e derivados, baixe o `Lumiar-…-Linux-x86_64.deb` e instale com dois cliques ou com:

```bash
sudo apt install ./Lumiar-*.deb
```

O Lumiar aparece no menu de aplicativos, com ícone, como qualquer outro programa.

Em outras distribuições, use o `Lumiar-…-Linux-x86_64.AppImage`. Um arquivo baixado não vem marcado como programa,
então o sistema não sabe que é um app até você dar a permissão de execução:

```bash
chmod +x Lumiar-*.AppImage
./Lumiar-*.AppImage
```

(Ou clique com o botão direito → Propriedades → Permitir executar como programa.) Algumas distribuições também
precisam do pacote `libfuse2` para abrir AppImages (`sudo apt install libfuse2`; no Ubuntu 24.04 ou mais novo,
`sudo apt install libfuse2t64`).

**macOS (12 ou mais novo)**
Baixe o `.dmg` do seu Mac: `Lumiar-…-macOS-arm64.dmg` para os com chip da Apple (M1, M2, M3…) ou
`Lumiar-…-macOS-x64.dmg` para os com Intel (em **Maçã → Sobre Este Mac** aparece "Chip" ou "Processador").
Abra o `.dmg` e arraste o Lumiar para a pasta Aplicativos.

O app não tem assinatura da Apple, então o Gatekeeper bloqueia na primeira vez. Clique com o botão direito no
Lumiar → **Abrir** → **Abrir**. No macOS 15 (Sequoia) ou mais novo esse atalho não aparece: tente abrir uma vez,
depois vá em **Ajustes do Sistema → Privacidade e Segurança** e clique em **Abrir Mesmo Assim**, lá embaixo.
Também dá para tirar o bloqueio pelo Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Lumiar.app
```

Para gravar a tela, o macOS pede a permissão uma vez em **Privacidade e Segurança → Gravação de Tela** (depois de
liberar, feche e abra o Lumiar). O som do computador não entra na gravação no Mac, só o microfone.

> Os instaladores são grandes (cerca de 450 MB) porque já trazem os modelos de IA das legendas, das vozes e da
> detecção de rosto, que funcionam sem internet. Os modelos maiores e menos usados (tradução, busca nas mídias,
> imagens de apoio, foto 3D e efeitos com profundidade, aumentar resolução e separar a voz, de 20 a 150 MB cada) são baixados do Hugging Face
> na primeira vez que a função é usada e ficam guardados no computador.

**Atualizações**: ao abrir, o programa instalado confere se saiu uma versão nova aqui no GitHub e mostra um aviso.
*Atualizar agora* baixa e instala sozinho no Windows e no AppImage; no .deb e no macOS, abre a página para baixar.

## Atalhos

No Mac, use Cmd no lugar do Ctrl. Estes são os padrões: **todos dá para mudar** em Ferramentas → *Atalhos do
teclado* (ou no ícone de teclado no topo, ou apertando **?**). Clique em *Mudar* e aperte a nova combinação; se ela já
for de outra ação, dá para trocar as duas. Tem busca, "Restaurar padrão" em cada uma e em todas, e as dicas dos botões
passam a mostrar a tecla nova. A escolha fica guardada no computador.

| Atalho | O que faz |
|---|---|
| Espaço | Tocar / pausar |
| J / K / L | Tocar para trás / pausar / tocar para frente (de novo: 2× e 4×) |
| ← / → | Um quadro para trás / para frente (com Shift, um segundo) |
| Ctrl + ← / → | Pular para o corte ou marcador anterior / seguinte |
| S | Dividir o clipe no cursor |
| Q / W | Cortar do começo do clipe até o cursor / do cursor até o fim |
| V | Ferramenta de seleção |
| Y / U / N | Ferramentas slip / slide / roll |
| 1 a 9 | Multicâmera: cortar para a câmera |
| Alt + arrastar | Duplicar o item arrastado |
| M | Marcador no cursor |
| R | Gravar / parar a narração |
| Ctrl + C / X / V | Copiar / recortar / colar no cursor |
| Ctrl + D | Duplicar |
| Ctrl + Z / Ctrl + Shift + Z | Desfazer / refazer |
| Ctrl + S / Ctrl + O | Salvar / abrir projeto |
| Delete | Excluir o que está selecionado |
| ? | Ver e mudar os atalhos |

## Rodando pelo código

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
git clone https://github.com/MikaelCosta05/lumiar.git
cd lumiar
npm install
npm run setup   # baixa os modelos de IA (~470 MB, só na primeira vez)
npm run dev     # abre no navegador (Chrome ou Edge)
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run app` | Compila e abre como programa (Electron) |
| `npm run dist:win` | Gera o instalador do Windows em `release/` |
| `npm run dist:linux` | Gera o AppImage e o .deb em `release/` (precisa rodar num Linux ou no WSL) |
| `npm run dist:mac` | Gera o .dmg e o .zip (chip da Apple e Intel) em `release/` (precisa rodar num Mac) |
| `npm run typecheck` | Confere os tipos do TypeScript |

## Como ele funciona por dentro

```
mídia ─► câmera / encaixe ─► efeitos ─► filtro ─┐
                                                ├─► transição ─► camadas de cima ─► pacotes ─► textos ─► tela / arquivo
mídia ─► câmera / encaixe ─► efeitos ─► filtro ─┘
```

O preview e a exportação usam o mesmo renderizador, então o arquivo final sai igual ao que aparece na tela.
Além da imagem, um efeito pode usar a máscara da pessoa, a profundidade, o fundo sem a pessoa, o movimento, os
quadros de até 1 s atrás e uma imagem que ele mesmo guarda de um quadro para o outro; o motor descobre pelo código
do shader o que cada efeito usa e só calcula isso.
Os vídeos são lidos e gravados com o [Mediabunny](https://mediabunny.dev); as legendas e a voz sintética usam
modelos do [Transformers.js](https://huggingface.co/docs/transformers.js) (Whisper e MMS-TTS); a detecção de rosto
usa o [MediaPipe](https://ai.google.dev/edge/mediapipe). A interface é React com Tailwind e o programa de
computador é Electron.

```
src/
├── engine/    renderizador WebGL2 e o sistema de plugins
├── project/   modelo do projeto: trilhas, clipes, câmera, legendas, pacotes, salvar e abrir
├── preview/   reprodução em tempo real
├── media/     importar, exportar, legendas, voz, gravação de tela, GIF, efeitos sonoros, pausas, limpeza do áudio, recorte de fundo, prévia leve
└── ui/        interface
plugins/       filtros, efeitos e transições (uma pasta cada)
electron/      programa de computador
```

## Créditos

As fotos e os vídeos das prévias de filtros e efeitos são do banco gratuito [Pexels](https://www.pexels.com/), sob a
[licença do Pexels](https://www.pexels.com/license/) (uso livre, sem crédito obrigatório); a lista está em
[`public/previews/CREDITOS.md`](public/previews/CREDITOS.md).

O mapa-múndi da rota animada é do [Natural Earth](https://www.naturalearthdata.com/) (domínio público), no formato do
pacote [world-atlas](https://github.com/topojson/world-atlas).
