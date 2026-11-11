# WaveCanvas Studio

O WaveCanvas Studio é uma aplicação web que mostra o áudio em forma de imagens animadas. O som pode vir do microfone ou de um ficheiro de áudio. Usamos a Web Audio API para analisar o som e o Canvas do HTML5 para desenhar. O projeto foi feito em JavaScript com classes e não usa bibliotecas externas.

## Autores

- André Loreti, nº 53903
- Diogo Amorim, nº 53563

Data: 11 de novembro de 2026

## Instalação e utilização

Basta ter um browser recente (Chrome, Edge ou Firefox). Não é preciso instalar nada.

Para o microfone e os ficheiros de exemplo funcionarem, a página tem de ser aberta através de um servidor local. A forma mais fácil é usar o Visual Studio Code:

1. Abrir a pasta do projeto no VS Code.
2. Instalar a extensão Live Server.
3. Clicar com o botão direito no index.html e escolher "Open with Live Server".

Também se pode usar o Python. Na pasta do projeto corre-se `python -m http.server 5500` e depois abre-se `http://localhost:5500` no browser.

Se abrirmos o index.html diretamente, a aplicação funciona na mesma com ficheiros escolhidos à mão. Nesse caso os botões de exemplo não funcionam e o microfone pode não funcionar.

### Como usar

- Para ouvir o som ambiente, clica-se em "Iniciar Microfone". O browser pede autorização.
- Para usar um ficheiro, clica-se em "Carregar ficheiro de áudio" e escolhe-se um WAV. Também se pode arrastar o ficheiro para cima do canvas.
- Os botões de exemplo tocam os ficheiros que estão na pasta sounds.
- A visualização escolhe-se no menu ou clicando numa das miniaturas.
- No painel de propriedades, por baixo do canvas, mudam-se as cores, a sensibilidade e os efeitos. O botão "Repor valores" volta aos valores iniciais.
- Um preset aplica-se clicando no seu nome. Para guardar as definições atuais escreve-se um nome e clica-se em "Guardar".
- "Exportar PNG" e "Exportar JPEG" descarregam a imagem que está no canvas. "Capturar screenshot" guarda a imagem numa galeria pequena, e clicando numa miniatura faz-se o download.

Também há atalhos de teclado:

- teclas 1 a 4 mudam a visualização;
- a barra de espaço pausa e continua o áudio;
- a tecla S tira uma screenshot;
- a tecla F põe em ecrã inteiro.

## Funcionalidades implementadas

### Parte 1: áudio e visualizações

A classe AudioProcessor trata do áudio. Captura o microfone e mostra uma mensagem de erro se a permissão for negada ou não houver microfone. Também lê ficheiros WAV, descodifica-os e toca-os. Em cada frame vai buscar ao analisador os dados das frequências e da forma de onda, e calcula o nível do som. Dá ainda para pausar, mudar o volume e repetir o ficheiro.

A classe AudioVisualization é abstrata, por isso não se pode criar diretamente. Tem o código comum a todas as visualizações: as propriedades, a suavização dos valores entre frames, os gradientes e a grelha de fundo.

Fizemos três visualizações obrigatórias:

- Espectro de frequências: barras com gradiente de cores, picos que caem devagar e reflexo. Pode ser em barras normais, espelhado ou em blocos tipo LED.
- Forma de onda: uma linha suave com gradiente e brilho. O traço pode ser contínuo, tracejado ou pontilhado, e a onda pode ser preenchida ou espelhada. Também deixa um rasto das ondas anteriores.
- Partículas: cada partícula segue uma frequência e mexe-se mais depressa quando essa frequência está alta. As partículas perto umas das outras ficam ligadas por linhas. Quando há uma batida forte nos graves saem partículas do centro.

A animação usa requestAnimationFrame. O movimento depende do tempo entre frames, por isso a velocidade é igual em computadores rápidos e lentos. Quando se muda de visualização há uma pequena transição. Para a performance medimos os FPS. Se ficarem abaixo de 40, a aplicação baixa a qualidade sozinha e tira os efeitos mais pesados.

### Parte 2: interface

A interface tem os botões de áudio, o menu de visualizações com miniaturas animadas e o painel de propriedades. O painel é criado automaticamente com as propriedades de cada visualização. Também mostra o estado do áudio, o tempo do ficheiro, os FPS e uma barra com o nível do som.

Cada visualização tem as suas cores, sensibilidade, suavização e efeitos próprios.

As imagens podem ser exportadas em PNG ou em JPEG, e no JPEG escolhe-se a qualidade. As screenshots ficam numa galeria com até 8 imagens.

### Parte 3: funcionalidades avançadas

Escolhemos estas duas:

- Visualização circular: as barras do espectro ficam à volta de um círculo que roda. A rotação fica mais rápida quando o som está alto, e o círculo do meio pulsa com os graves.
- Sistema de presets: há 7 presets já feitos (Néon Clássico, Fogo, Retro LED, Oceano, Osciloscópio, Galáxia e Hipnótico). O utilizador pode guardar os seus próprios presets, que ficam no localStorage do browser, e apagá-los depois.

### Erros

Os erros são tratados no método handleError da classe App, conforme o sítio onde aconteceram:

- erro no áudio: o áudio para;
- erro numa visualização: volta para o espectro;
- erro ao exportar: tenta mais uma vez antes de desistir.

Em todos os casos aparece uma janela com a mensagem e o erro fica escrito na consola.

## Arquitetura

O código está dividido em várias classes, cada uma no seu ficheiro:

- app.js tem a classe App, que cria as outras classes e liga tudo. Os botões chamam sempre métodos da App.
- js/AudioProcessor.js trata do microfone, dos ficheiros e da análise do som.
- js/AudioVisualization.js é a classe base das visualizações.
- js/visualizations/ tem uma classe para cada visualização: espectro, onda, partículas e circular.
- js/VisualizationEngine.js trata do canvas e do loop de animação. Guarda as visualizações num Map e sabe qual é a atual.
- js/UIManager.js trata da página: botões, painel de propriedades, presets e galeria.
- js/ExportManager.js exporta as imagens e guarda as screenshots.
- js/PresetManager.js tem os presets e guarda os do utilizador.

Funciona assim: o AudioProcessor recebe o som e, em cada frame, o VisualizationEngine pede-lhe os dados novos. Depois chama o update() e o draw() da visualização atual, que desenha no canvas.

Para acrescentar uma visualização nova basta criar uma classe que estende AudioVisualization, implementar o método draw() e registá-la no VisualizationEngine.
