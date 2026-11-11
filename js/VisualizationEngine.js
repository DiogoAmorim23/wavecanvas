// Motor de visualização
// trata do canvas, do loop de animação e de trocar de visualização
class VisualizationEngine {
    constructor(canvasId, audioProcessor = null) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error(`Canvas "${canvasId}" não encontrado.`);
        this.ctx = this.canvas.getContext('2d');
        this.audioProcessor = audioProcessor;

        this.visualizations = new Map();      // guarda as visualizações criadas
        this.visualizationTypes = new Map();  // guarda o nome e a classe de cada tipo
        this.currentVisualization = null;
        this.currentType = null;
        this.defaultType = 'spectrum';

        // controlo do loop de animação
        this.animationId = null;
        this.isRunning = false;
        this.lastTimestamp = 0;

        // para a transição entre visualizações
        this.transitionCanvas = document.createElement('canvas');
        this.transitionAlpha = 0;
        this.transitionDuration = 0.45;

        // miniaturas
        this.previews = [];

        // para medir a performance
        this.fps = 60;
        this.frameTimes = [];
        this.qualityMode = 'auto';            // pode ser auto, high ou low
        this.quality = 'high';
        this.lowFpsTime = 0;
        this.highFpsTime = 0;

        // funções que a App e o UIManager vão definir
        this.onFrame = null;                  // chamada em cada frame
        this.onError = null;                  // chamada quando há erro

        this.initVisualizations();
        this.setupResize();
    }

    // regista as 4 visualizações
    initVisualizations() {
        this.registerVisualization('spectrum', 'Espectro de Frequências', SpectrumVisualization);
        this.registerVisualization('waveform', 'Forma de Onda', WaveformVisualization);
        this.registerVisualization('particles', 'Partículas', ParticleVisualization);
        this.registerVisualization('circular', 'Espectro Circular', CircularVisualization);
    }

    // cria uma visualização e guarda-a no Map
    registerVisualization(type, label, VisualizationClass) {
        this.visualizationTypes.set(type, { label, VisualizationClass });
        const instance = new VisualizationClass(this.canvas, this.audioProcessor);
        instance.resize(this.cssWidth || this.canvas.width, this.cssHeight || this.canvas.height);
        this.visualizations.set(type, instance);
    }

    // liga o processador de áudio a todas as visualizações
    setAudioProcessor(audioProcessor) {
        this.audioProcessor = audioProcessor;
        this.visualizations.forEach(v => { v.audioProcessor = audioProcessor; });
        this.previews.forEach(p => { p.visualization.audioProcessor = audioProcessor; });
    }

    // lista dos tipos para o menu
    getVisualizationTypes() {
        return Array.from(this.visualizationTypes.entries()).map(([type, info]) => ({ type, label: info.label }));
    }

    // muda a visualização atual (devolve false se não existir)
    setVisualization(type) {
        if (!this.visualizations.has(type)) {
            console.warn(`Visualização desconhecida: ${type}`);
            return false;
        }
        if (type === this.currentType) return true;

        // guardar uma cópia do frame atual para fazer a transição
        if (this.currentVisualization) {
            this.transitionCanvas.width = this.canvas.width;
            this.transitionCanvas.height = this.canvas.height;
            this.transitionCanvas.getContext('2d').drawImage(this.canvas, 0, 0);
            this.transitionAlpha = 1;
        }

        this.currentType = type;
        this.currentVisualization = this.visualizations.get(type);
        this.currentVisualization.quality = this.quality;
        this.currentVisualization.resize(this.cssWidth, this.cssHeight);

        // se o loop estiver parado, desenhar um frame
        if (!this.isRunning) this.renderFrame(1 / 60);
        return true;
    }

    // começa o loop de animação
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        const loop = (timestamp) => {
            if (!this.isRunning) return;
            // tempo desde o último frame em segundos (no máximo 0.1)
            const deltaTime = Math.min(0.1, Math.max(0.001, (timestamp - this.lastTimestamp) / 1000));
            this.lastTimestamp = timestamp;
            this.renderFrame(deltaTime);
            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    // para o loop
    stop() {
        this.isRunning = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.animationId = null;
    }

    // desenha um frame: atualiza o áudio e depois a visualização
    renderFrame(deltaTime) {
        if (this.audioProcessor) this.audioProcessor.update();

        const viz = this.currentVisualization;
        if (viz) {
            // se a visualização der erro trocamos para a default
            try {
                viz.update(deltaTime);
                viz.draw();
            } catch (error) {
                this.handleVisualizationError(error);
                return;
            }
        }

        this.drawTransition(deltaTime);
        this.updatePerformance(deltaTime);
        this.renderPreviews(deltaTime);

        // avisar a interface para atualizar os indicadores
        if (typeof this.onFrame === 'function') {
            this.onFrame({
                fps: this.fps,
                quality: this.quality,
                level: this.audioProcessor ? this.audioProcessor.level : 0,
                peak: this.audioProcessor ? this.audioProcessor.peak : 0
            });
        }
    }

    // quando uma visualização falha volta para a default
    handleVisualizationError(error) {
        console.error('Erro na visualização:', error);
        const failedType = this.currentType;
        if (failedType !== this.defaultType) {
            this.currentType = null;
            this.setVisualization(this.defaultType);
        } else {
            this.stop();
        }
        if (typeof this.onError === 'function') {
            this.onError(new Error(`A visualização "${failedType}" falhou e foi substituída pela visualização por omissão. (${error.message})`));
        }
    }

    // desenha o frame antigo por cima, cada vez mais transparente
    drawTransition(deltaTime) {
        if (this.transitionAlpha <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // ao quadrado para ficar mais suave
        ctx.globalAlpha = this.transitionAlpha * this.transitionAlpha;
        ctx.drawImage(this.transitionCanvas, 0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
        this.transitionAlpha = Math.max(0, this.transitionAlpha - deltaTime / this.transitionDuration);
    }

    // calcula os FPS e muda a qualidade sozinho
    // abaixo de 40 FPS durante 2 segundos passa a baixa, acima de 55 volta a alta
    updatePerformance(deltaTime) {
        this.frameTimes.push(deltaTime);
        if (this.frameTimes.length > 30) this.frameTimes.shift();
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        this.fps = Math.round(1 / avg);

        let target = this.quality;
        if (this.qualityMode === 'auto') {
            if (this.fps < 40) { this.lowFpsTime += deltaTime; this.highFpsTime = 0; }
            else if (this.fps > 55) { this.highFpsTime += deltaTime; this.lowFpsTime = 0; }
            if (this.lowFpsTime > 2) target = 'low';
            if (this.highFpsTime > 5) target = 'high';
        } else {
            target = this.qualityMode;
        }

        if (target !== this.quality) this.setQuality(target);
    }

    // muda a qualidade em todas as visualizações
    setQuality(quality) {
        this.quality = quality;
        this.lowFpsTime = 0;
        this.highFpsTime = 0;
        this.visualizations.forEach(v => { v.quality = quality; });
    }

    // escolha do utilizador: auto, alta ou baixa
    setQualityMode(mode) {
        this.qualityMode = mode;
        if (mode !== 'auto') this.setQuality(mode);
    }

    // miniaturas

    // cria uma visualização separada para uma miniatura
    registerPreview(type, canvas) {
        const info = this.visualizationTypes.get(type);
        if (!info) return null;
        const visualization = new info.VisualizationClass(canvas, this.audioProcessor);
        visualization.useDemoData = true;
        visualization.quality = 'low';
        const preview = { type, canvas, visualization, accumulator: 0 };
        this.previews.push(preview);
        this.resizePreview(preview);
        visualization.update(1 / 60);
        visualization.draw();
        return preview;
    }

    // ajusta o tamanho do canvas da miniatura
    resizePreview(preview) {
        const rect = preview.canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width || preview.canvas.width));
        const height = Math.max(1, Math.round(rect.height || preview.canvas.height));
        preview.canvas.width = width;
        preview.canvas.height = height;
        preview.visualization.resize(width, height);
    }

    // as miniaturas só atualizam 20 vezes por segundo para poupar
    renderPreviews(deltaTime) {
        if (!this.previews.length || this.quality === 'low') return;
        for (const preview of this.previews) {
            preview.accumulator += deltaTime;
            if (preview.accumulator < 0.05) continue;
            try {
                preview.visualization.update(preview.accumulator);
                preview.visualization.draw();
            } catch (error) {
                console.warn('Erro na pré-visualização', preview.type, error);
            }
            preview.accumulator = 0;
        }
    }

    // tamanho do canvas

    // redimensiona sempre que o tamanho do canvas muda
    setupResize() {
        this.resize();
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.canvas);
        } else {
            window.addEventListener('resize', () => this.resize());
        }
    }

    // ajusta o canvas ao tamanho real no ecrã (e a ecrãs com mais pixels)
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(rect.width || 800));
        const height = Math.max(1, Math.round(rect.height || 300));

        // se nada mudou não faz nada
        if (width === this.cssWidth && height === this.cssHeight && dpr === this.dpr) return;

        this.cssWidth = width;
        this.cssHeight = height;
        this.dpr = dpr;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.visualizations.forEach(v => v.resize(width, height));
        this.previews.forEach(p => this.resizePreview(p));

        if (!this.isRunning && this.currentVisualization) this.renderFrame(1 / 60);
    }

    // propriedades

    // propriedades da visualização atual
    getVisualizationProperties() {
        return this.currentVisualization ? this.currentVisualization.getProperties() : {};
    }

    // só os valores das propriedades
    getVisualizationPropertyValues() {
        return this.currentVisualization ? this.currentVisualization.getPropertyValues() : {};
    }

    // muda uma propriedade da visualização atual
    updateVisualizationProperty(property, value) {
        if (!this.currentVisualization) return false;
        const ok = this.currentVisualization.updateProperty(property, value);
        if (ok && !this.isRunning) this.renderFrame(1 / 60);
        return ok;
    }

    // para tudo
    destroy() {
        this.stop();
        if (this.resizeObserver) this.resizeObserver.disconnect();
    }
}
