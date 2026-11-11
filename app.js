// Classe principal da aplicação
// cria os outros objetos e liga tudo
class App {
    constructor() {
        // criar os componentes (o UIManager é o último porque precisa dos outros)
        this.audioProcessor = new AudioProcessor();
        this.visualizationEngine = new VisualizationEngine('audioCanvas', this.audioProcessor);
        this.exportManager = new ExportManager(this.visualizationEngine);
        this.presetManager = new PresetManager(this.visualizationEngine);
        this.uiManager = new UIManager(this);

        // Inicialização
        this.init();
    }

    // prepara a aplicação
    init() {
        const engine = this.visualizationEngine;

        // quando a visualização dá erro
        engine.onError = (error) => this.handleError('visualization', error);

        // quando o ficheiro acaba de tocar
        this.audioProcessor.onEnded = () => {
            this.uiManager.setButtonStates(false);
            this.uiManager.setStatusBadge('idle');
            this.uiManager.updateAudioInfo({ status: 'Reprodução terminada' });
        };

        // começar com a visualização default
        this.setVisualization(engine.defaultType);

        // o loop corre sempre para as miniaturas continuarem a mexer
        engine.start();

        // limpar tudo ao sair da página
        window.addEventListener('beforeunload', () => this.destroy());

        console.log('App inicializada');
    }

    // iniciar o microfone
    async startMicrophone() {
        const ui = this.uiManager;
        // desativar os botões enquanto carrega
        ui.setLoading(true);
        try {
            // pedir o microfone ao AudioProcessor
            await this.audioProcessor.startMicrophone();
            this.visualizationEngine.start();
            ui.setLoading(false);
            ui.setButtonStates(true);
            ui.setStatusBadge('live');
            ui.updateAudioInfo({
                status: 'Microfone ativo',
                details: `Taxa de amostragem: ${this.audioProcessor.getSampleRate()} Hz · FFT ${this.audioProcessor.fftSize}`
            });
        } catch (error) {
            ui.setLoading(false);
            ui.setButtonStates(false);
            this.handleError('audio', error);
        }
    }

    // carregar um ficheiro de áudio
    async loadAudioFile(file) {
        const ui = this.uiManager;
        ui.setLoading(true);
        ui.updateAudioInfo({ status: `A carregar "${file.name}"…`, details: '' });
        try {
            // o AudioProcessor lê e descodifica o ficheiro
            const info = await this.audioProcessor.loadAudioFile(file);
            this.visualizationEngine.start();
            ui.setLoading(false);
            ui.setButtonStates(true);
            ui.setStatusBadge('playing');
            ui.updateAudioInfo({
                status: `A reproduzir "${info.name}"`,
                details: `${ui.formatTime(info.duration)} · ${info.sampleRate} Hz · ${info.channels === 1 ? 'Mono' : info.channels === 2 ? 'Estéreo' : info.channels + ' canais'} · ${(info.size / 1024 / 1024).toFixed(2)} MB`
            });
        } catch (error) {
            ui.setLoading(false);
            ui.setButtonStates(false);
            this.handleError('audio', error);
        }
    }

    // carrega um ficheiro de exemplo da pasta sounds
    async loadSample(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const name = url.split('/').pop();
            // transformar em File para usar o mesmo método
            const file = new File([blob], name, { type: blob.type || 'audio/wav' });
            await this.loadAudioFile(file);
        } catch (error) {
            this.handleError('audio', new Error(
                `Não foi possível carregar o exemplo "${url}". Se abriu o index.html diretamente (file://), ` +
                `use um servidor local (ex: Live Server) ou carregue o ficheiro manualmente. (${error.message})`
            ));
        }
    }

    // parar o áudio
    stopAudio() {
        this.audioProcessor.stop();
        this.uiManager.setButtonStates(false);
        this.uiManager.setStatusBadge('idle');
        this.uiManager.updateAudioInfo({ status: 'Parado', details: 'Inicie o microfone ou carregue um ficheiro WAV.' });
    }

    // pausar ou continuar
    async togglePause() {
        const ap = this.audioProcessor;
        if (!ap.isPlaying) return;
        try {
            if (ap.isPaused) {
                await ap.resume();
                this.uiManager.setStatusBadge(ap.sourceType === 'microphone' ? 'live' : 'playing');
            } else {
                await ap.pause();
                this.uiManager.setStatusBadge('paused');
            }
            this.uiManager.setButtonStates(true, ap.isPaused);
        } catch (error) {
            this.handleError('audio', error);
        }
    }

    // mudar de visualização
    setVisualization(type) {
        const ok = this.visualizationEngine.setVisualization(type);
        if (!ok) {
            // se não existir fica a atual e mostra erro
            this.uiManager.setActiveVisualization(this.visualizationEngine.currentType);
            this.handleError('ui', new Error(`A visualização "${type}" não existe.`));
            return false;
        }
        // atualizar a interface
        this.uiManager.setActiveVisualization(type);
        this.uiManager.updatePropertiesPanel();
        return true;
    }

    // voltar aos valores default
    resetProperties() {
        const engine = this.visualizationEngine;
        const defaults = this.presetManager.getDefaultProperties(engine.currentType);
        Object.entries(defaults).forEach(([k, v]) => engine.updateVisualizationProperty(k, v));
        this.uiManager.updatePropertiesPanel();
        this.uiManager.showToast('Propriedades repostas');
    }

    // presets

    // aplicar um preset
    applyPreset(id) {
        try {
            const preset = this.presetManager.applyPreset(id);
            this.uiManager.setActiveVisualization(preset.visualization);
            this.uiManager.updatePropertiesPanel();
            this.uiManager.showToast(`Preset "${preset.name}" aplicado`);
        } catch (error) {
            this.handleError('ui', error);
        }
    }

    // guardar um preset novo
    savePreset(name) {
        try {
            const preset = this.presetManager.saveCurrentAsPreset(name);
            this.uiManager.elements.presetName.value = '';
            this.uiManager.renderPresets();
            this.uiManager.showToast(`Preset "${preset.name}" guardado`);
        } catch (error) {
            this.handleError('ui', error);
        }
    }

    // apagar um preset
    deletePreset(id) {
        if (this.presetManager.deletePreset(id)) {
            this.uiManager.renderPresets();
            this.uiManager.showToast('Preset apagado');
        }
    }

    // exportação

    // exportar a imagem em png ou jpeg
    async exportFrame(format = 'png') {
        try {
            const shot = format === 'jpeg'
                ? await this.exportManager.exportAsJPEG(parseFloat(this.uiManager.elements.jpegQuality.value))
                : await this.exportManager.exportAsPNG();
            this.uiManager.renderGallery();
            this.uiManager.showToast(`Exportado: ${shot.filename}`);
        } catch (error) {
            this.handleError('export', error);
        }
    }

    // tirar uma screenshot para a galeria
    async captureScreenshot() {
        try {
            await this.exportManager.captureScreenshot('image/png');
            this.uiManager.renderGallery();
            this.uiManager.showToast('Screenshot capturado — clique na miniatura para descarregar');
        } catch (error) {
            this.handleError('export', error);
        }
    }

    // erros

    // trata o erro conforme a origem, mostra a mensagem e escreve na consola
    handleError(source, error) {
        const message = error && error.message ? error.message : String(error);

        switch (source) {
            case 'audio':
                // parar o áudio e voltar ao início
                this.audioProcessor.stop();
                this.uiManager.setButtonStates(false);
                this.uiManager.setStatusBadge('idle');
                this.uiManager.updateAudioInfo(message, true);
                break;
            case 'visualization':
                // o motor já mudou para a visualização default
                this.uiManager.setActiveVisualization(this.visualizationEngine.currentType);
                this.uiManager.updatePropertiesPanel();
                break;
            case 'ui':
                // voltar a criar a lista de presets
                this.uiManager.renderPresets();
                break;
            case 'export':
                // o ExportManager já tentou outra vez, desiste
                break;
        }

        this.uiManager.showError(message);
        console.error(`[${source}]`, error);
    }

    // liberta os recursos
    destroy() {
        this.visualizationEngine.destroy();
        this.audioProcessor.destroy();
        console.log('Aplicação terminada');
    }
}

// Inicialização da aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    try {
        const app = new App();
        // para poder usar a app na consola
        window.app = app;
    } catch (error) {
        console.error('Erro ao iniciar a aplicação:', error);
        // se a app não arrancar mostra o erro
        const msg = document.getElementById('errorMessage');
        if (msg) {
            msg.textContent = `Erro ao iniciar a aplicação: ${error.message}`;
            document.getElementById('errorModal').classList.remove('hidden');
        }
    }
});
