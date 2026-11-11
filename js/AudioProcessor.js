// Classe que trata do áudio (microfone, ficheiros e análise do som)
class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.gainNode = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.audioBuffer = null;

        // tamanho da FFT, quanto maior mais detalhe nas frequências
        this.fftSize = 2048;
        this.smoothingTimeConstant = 0.8;

        // arrays onde ficam os dados do analisador
        this.frequencyData = new Uint8Array(0);
        this.waveformData = new Uint8Array(0);

        this.isPlaying = false;
        this.isPaused = false;
        this.sourceType = null;          // pode ser 'microphone', 'file' ou null
        this.fileInfo = null;            // informação do ficheiro carregado
        this.loop = false;
        this.volume = 0.8;

        this.startedAt = 0;              // tempo em que o áudio começou
        this.level = 0;                  // nível do som entre 0 e 1
        this.peak = 0;                   // pico do som, desce devagar

        // função chamada quando o ficheiro acaba de tocar
        this.onEnded = null;
    }

    // cria o AudioContext e o analisador (só uma vez)
    initAudioContext() {
        if (this.audioContext) return this.audioContext;

        // alguns browsers antigos usam webkitAudioContext
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            throw new Error('O seu browser não suporta a Web Audio API.');
        }

        this.audioContext = new AudioCtx();
        // o analyser dá-nos os dados das frequências e da onda
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;

        // o gain serve para controlar o volume
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volume;

        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.waveformData = new Uint8Array(this.analyser.fftSize);
        this.waveformData.fill(128);

        return this.audioContext;
    }

    // pede acesso ao microfone e liga-o ao analisador
    async startMicrophone() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Captura de microfone não suportada neste browser (é necessário HTTPS ou localhost).');
        }

        // parar o que estiver a tocar antes
        this.stop();
        this.initAudioContext();
        // o browser pode ter o áudio suspenso
        await this.audioContext.resume();

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
        } catch (error) {
            throw new Error(this.describeMediaError(error));
        }

        // o microfone só liga ao analisador e não às colunas, para não haver eco
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.sourceNode.connect(this.analyser);

        this.sourceType = 'microphone';
        this.fileInfo = null;
        this.isPlaying = true;
        this.isPaused = false;
        this.startedAt = this.audioContext.currentTime;
        return true;
    }

    // carrega um ficheiro de áudio, descodifica e começa a tocar
    async loadAudioFile(file) {
        if (!file) throw new Error('Nenhum ficheiro selecionado.');
        if (file.type && !file.type.startsWith('audio/')) {
            throw new Error(`O ficheiro "${file.name}" não é um ficheiro de áudio.`);
        }

        this.stop();
        this.initAudioContext();
        await this.audioContext.resume();

        // ler o ficheiro
        let arrayBuffer;
        try {
            arrayBuffer = await this.readFile(file);
        } catch (error) {
            throw new Error(`Não foi possível ler o ficheiro "${file.name}".`);
        }

        // descodificar o áudio
        try {
            this.audioBuffer = await this.decode(arrayBuffer);
        } catch (error) {
            throw new Error(`Não foi possível descodificar "${file.name}". Formato não suportado ou ficheiro corrompido.`);
        }

        // guardar a informação do ficheiro para mostrar na página
        this.fileInfo = {
            name: file.name,
            duration: this.audioBuffer.duration,
            sampleRate: this.audioBuffer.sampleRate,
            channels: this.audioBuffer.numberOfChannels,
            size: file.size
        };

        // começar a tocar
        this.playBuffer();
        return this.fileInfo;
    }

    readFile(file) {
        // lê o ficheiro com o FileReader e devolve uma Promise
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    decode(arrayBuffer) {
        // descodifica o áudio (funciona em browsers novos e antigos)
        return new Promise((resolve, reject) => {
            const result = this.audioContext.decodeAudioData(arrayBuffer, resolve, reject);
            if (result && typeof result.then === 'function') result.then(resolve, reject);
        });
    }

    // cria a fonte de som e liga ao analisador, ao volume e às colunas
    playBuffer() {
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffer;
        source.loop = this.loop;
        source.connect(this.analyser);
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        // quando o ficheiro acaba
        source.onended = () => {
            // ignorar se esta fonte já não é a atual
            if (this.sourceNode !== source) return;
            this.stop();
            if (typeof this.onEnded === 'function') this.onEnded();
        };

        source.start(0);
        this.sourceNode = source;
        this.sourceType = 'file';
        this.isPlaying = true;
        this.isPaused = false;
        this.startedAt = this.audioContext.currentTime;
    }

    // pausa o áudio suspendendo o contexto
    async pause() {
        if (!this.isPlaying || this.isPaused || !this.audioContext) return;
        await this.audioContext.suspend();
        this.isPaused = true;
    }

    // continua o áudio
    async resume() {
        if (!this.isPlaying || !this.isPaused || !this.audioContext) return;
        await this.audioContext.resume();
        this.isPaused = false;
    }

    // para tudo e desliga o microfone
    stop() {
        if (this.sourceNode) {
            const node = this.sourceNode;
            this.sourceNode = null;
            try { if (node.stop) node.stop(); } catch (e) { /* já parado */ }
            try { node.disconnect(); } catch (e) { /* ignorar */ }
        }

        // desligar o microfone
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.analyser) {
            try { this.analyser.disconnect(); } catch (e) { /* ignorar */ }
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // voltar ao estado inicial
        this.isPlaying = false;
        this.isPaused = false;
        this.sourceType = null;
    }

    // chamado em cada frame para ir buscar os dados novos
    update() {
        if (!this.analyser) return;

        if (this.isPlaying && !this.isPaused) {
            this.analyser.getByteFrequencyData(this.frequencyData);
            this.analyser.getByteTimeDomainData(this.waveformData);
        } else {
            // sem áudio os valores vão descendo aos poucos até zero
            for (let i = 0; i < this.frequencyData.length; i++) {
                this.frequencyData[i] = this.frequencyData[i] * 0.9;
            }
            for (let i = 0; i < this.waveformData.length; i++) {
                this.waveformData[i] = 128 + (this.waveformData[i] - 128) * 0.85;
            }
        }

        this.level = this.calculateAudioLevel();
        this.peak = Math.max(this.level, this.peak * 0.97);
    }

    // devolve os dados das frequências
    getFrequencyData() {
        return this.frequencyData;
    }

    // devolve os dados da onda
    getWaveformData() {
        return this.waveformData;
    }

    // calcula o volume médio (RMS) e devolve um valor entre 0 e 1
    calculateAudioLevel() {
        const data = this.waveformData;
        if (!data.length) return 0;

        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // multiplicar para o valor não ficar muito baixo
        return Math.min(1, rms * 2.5);
    }

    // média das frequências entre minHz e maxHz (valor entre 0 e 1)
    getBandEnergy(minHz, maxHz) {
        if (!this.audioContext || !this.frequencyData.length) return 0;
        const nyquist = this.audioContext.sampleRate / 2;
        const binHz = nyquist / this.frequencyData.length;
        const start = Math.max(0, Math.floor(minHz / binHz));
        const end = Math.min(this.frequencyData.length - 1, Math.ceil(maxHz / binHz));
        if (end < start) return 0;

        let sum = 0;
        for (let i = start; i <= end; i++) sum += this.frequencyData[i];
        return sum / ((end - start + 1) * 255);
    }

    // tempo que já passou desde o início
    getCurrentTime() {
        if (!this.audioContext || !this.isPlaying) return 0;
        const elapsed = this.audioContext.currentTime - this.startedAt;
        if (this.sourceType === 'file' && this.audioBuffer && this.loop) {
            return elapsed % this.audioBuffer.duration;
        }
        return elapsed;
    }

    // taxa de amostragem do áudio
    getSampleRate() {
        return this.audioContext ? this.audioContext.sampleRate : 44100;
    }

    // muda o volume
    setVolume(value) {
        this.volume = value;
        if (this.gainNode) this.gainNode.gain.value = value;
    }

    // liga ou desliga a repetição
    setLoop(loop) {
        this.loop = loop;
        if (this.sourceNode && this.sourceType === 'file') this.sourceNode.loop = loop;
    }

    // muda a suavização do analisador
    setSmoothing(value) {
        this.smoothingTimeConstant = value;
        if (this.analyser) this.analyser.smoothingTimeConstant = value;
    }

    // transforma o erro do microfone numa mensagem simples
    describeMediaError(error) {
        switch (error && error.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Permissão para usar o microfone foi negada. Autorize o acesso nas definições do browser.';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return 'Nenhum microfone encontrado. Ligue um microfone e tente novamente.';
            case 'NotReadableError':
                return 'O microfone está a ser usado por outra aplicação.';
            default:
                return `Erro ao aceder ao microfone: ${error && error.message ? error.message : error}`;
        }
    }

    // fecha o contexto de áudio
    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
