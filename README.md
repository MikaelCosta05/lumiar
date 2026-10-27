<div align="center">

<img src="electron/icon.png" width="96" alt="Ícone do Lumiar">

# Lumiar

**Editor de vídeo para computador, feito para quem gosta de efeito, transição e filtro.**
Roda no Windows e no Linux, e tudo (inclusive legendas automáticas e voz sintética) funciona sem internet.

[**Baixar para Windows**](https://github.com/MikaelCosta05/lumiar/releases/latest) ·
[**Baixar para Linux**](https://github.com/MikaelCosta05/lumiar/releases/latest) ·
[Rodar pelo código](#rodando-pelo-código)

<br>

![O editor com um vídeo, um título, uma sobreposição e legendas](docs/screenshots/editor.jpg)

</div>

---

Comecei o Lumiar porque queria um editor no estilo do Filmora em que eu pudesse inventar os meus próprios
efeitos e transições. Hoje ele vem com **117 filtros, 67 transições e 56 efeitos**, e cada um deles é só uma
pastinha com um shader. Se você souber um pouco de GLSL, dá para criar o seu em minutos
([guia aqui](docs/PLUGINS.md)).

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
- **Marcadores** (tecla **M**) para anotar pontos importantes, e **Ctrl + ← / →** pula entre cortes.
- Desfazer e refazer (até 200 passos), salvamento automático e um arquivo `.lumiar` que guarda o projeto e as mídias juntos.

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

- **Keyframes** em qualquer parâmetro: marque um valor num ponto e outro mais à frente, e o Lumiar anima entre os dois.

### Câmera e velocidade

- Movimentos de câmera prontos (Ken Burns, panorâmica, zoom de impacto, drone, vertigem…) ou feitos à mão com keyframes.
- **Seguir rosto**: o editor encontra o rosto em cada quadro e mantém a pessoa enquadrada.
- **Seguir ponto**: clique em qualquer coisa no vídeo e a câmera acompanha.
- **Câmera lenta fluida**: abaixo de 1× o Lumiar cria os quadros que faltam estimando o movimento, em vez de repetir quadros.
- Girar 90°, espelhar, congelar quadro e tocar de trás para frente.

### Textos e legendas

- 31 estilos de título prontos (neon, cinema, 8-bit, máquina de escrever, faixa de nome…), 10 fontes e animações
  de entrada, saída e contínuas.
- **Legendas automáticas** com o Whisper, rodando no seu computador: cada palavra ganha o seu tempo e dá para usar
  estilos como o "destaque" do TikTok, em que a palavra falada muda de cor. Também importa e exporta `.srt` e `.vtt`.

### Voz: narração e dublagem

- **Grave a narração** com o vídeo tocando junto. Você escolhe o microfone, testa o volume, tem contagem regressiva
  e um **teleprompter** que rola o seu roteiro por cima do vídeo.
- **Dublagem**: selecione um clipe e grave por cima dele, no tempo certo. A gravação para sozinha no fim do clipe.

![Gravando a narração com o teleprompter na tela](docs/screenshots/voz.jpg)

- **Voz sintética** em português, inglês e espanhol, gerada sem internet. Dá até para dublar automaticamente todas as legendas.
- **Efeitos de voz**: voz limpa (estilo podcast), telefone, rádio, megafone, eco, caverna, robô, debaixo d'água,
  monstro e esquilo.
- A música **abaixa sozinha** enquanto alguém fala e volta depois.

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
em quatro níveis de qualidade. Dá para exportar só um trecho ou salvar o quadro atual como imagem.

![Janela de exportação](docs/screenshots/exportar.jpg)

## Instalando

Os instaladores ficam na página de [**Releases**](https://github.com/MikaelCosta05/lumiar/releases/latest).

**Windows (10 ou 11, 64 bits)**
Baixe o `Lumiar-…-Windows-Setup.exe` e abra. Como o instalador não tem assinatura digital, o Windows pode mostrar
"O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.

**Linux (64 bits)**
Baixe o `Lumiar-…-Linux-x86_64.AppImage` e rode:

```bash
chmod +x Lumiar-*.AppImage
./Lumiar-*.AppImage
```

Algumas distribuições precisam do pacote `libfuse2` para abrir AppImages
(`sudo apt install libfuse2` no Ubuntu e derivados).

> Os instaladores são grandes (cerca de 450 MB) porque já trazem os modelos de IA das legendas, das vozes e da
> detecção de rosto. Em troca, nada precisa de internet depois de instalado.

## Atalhos

| Atalho | O que faz |
|---|---|
| Espaço | Tocar / pausar |
| ← / → | Um quadro para trás / para frente (com Shift, um segundo) |
| Ctrl + ← / → | Pular para o corte ou marcador anterior / seguinte |
| S | Dividir o clipe no cursor |
| M | Marcador no cursor |
| R | Gravar / parar a narração |
| Ctrl + C / X / V | Copiar / recortar / colar no cursor |
| Ctrl + D | Duplicar |
| Ctrl + Z / Ctrl + Shift + Z | Desfazer / refazer |
| Ctrl + S / Ctrl + O | Salvar / abrir projeto |
| Delete | Excluir o que está selecionado |

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
| `npm run dist:linux` | Gera o AppImage em `release/` (precisa rodar num Linux ou no WSL) |
| `npm run typecheck` | Confere os tipos do TypeScript |

## Como ele funciona por dentro

```
mídia ─► câmera / encaixe ─► efeitos ─► filtro ─┐
                                                ├─► transição ─► camadas de cima ─► textos ─► tela / arquivo
mídia ─► câmera / encaixe ─► efeitos ─► filtro ─┘
```

O preview e a exportação usam o mesmo renderizador, então o arquivo final sai igual ao que aparece na tela.
Os vídeos são lidos e gravados com o [Mediabunny](https://mediabunny.dev); as legendas e a voz sintética usam
modelos do [Transformers.js](https://huggingface.co/docs/transformers.js) (Whisper e MMS-TTS); a detecção de rosto
usa o [MediaPipe](https://ai.google.dev/edge/mediapipe). A interface é React com Tailwind e o programa de
computador é Electron.

```
src/
├── engine/    renderizador WebGL2 e o sistema de plugins
├── project/   modelo do projeto: trilhas, clipes, câmera, legendas, salvar e abrir
├── preview/   reprodução em tempo real
├── media/     importar, exportar, legendas, voz, gravação, GIF
└── ui/        interface
plugins/       filtros, efeitos e transições (uma pasta cada)
electron/      programa de computador
```

## Créditos das mídias de exemplo

Os vídeos e fotos do botão "Usar mídias de exemplo" são de domínio público ou CC0 (NASA e outros).
A lista completa está em [`public/samples/CREDITOS.md`](public/samples/CREDITOS.md).
