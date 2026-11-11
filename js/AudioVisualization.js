// Classe abstrata base para todas as visualizações
// tem o código que é comum a todas
class AudioVisualization {
    constructor(canvas, audioProcessor) {
        // não deixa criar objetos desta classe diretamente
        if (this.constructor === AudioVisualization) {
            throw new Error('AudioVisualization é uma classe abstrata e não pode ser instanciada diretamente.');
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioProcessor = audioProcessor;
        this.name = 'Visualização';

        // valores das propriedades (cores, tamanhos, etc.)
        this.properties = {};
        // informação de cada propriedade para criar os controlos (tipo, min, max)
        this.propertyDefinitions = {};

        // tamanho do canvas
        this.width = canvas.width;
        this.height = canvas.height;

        this.frameCount = 0;
        this.time = 0;                  // segundos desde que foi criada
        this.quality = 'high';          // qualidade 'high' ou 'low'
        this.useDemoData = false;       // nas miniaturas usamos dados de teste

        this.smoothed = new Float32Array(0); // valores suavizados entre frames
        // dados de teste para as miniaturas
        this.testData = new Uint8Array(1024);
        this.testWave = new Uint8Array(2048);

        // propriedades que todas as visualizações têm
        this.defineProperty('backgroundColor', {
            label: 'Cor de fundo', type: 'color', value: '#0b1026', group: 'Geral'
        });
        this.defineProperty('sensitivity', {
            label: 'Sensibilidade', type: 'range', value: 1, min: 0.2, max: 3, step: 0.05, group: 'Geral'
        });
        this.defineProperty('smoothing', {
            label: 'Suavização', type: 'range', value: 0.5, min: 0, max: 0.95, step: 0.05, group: 'Geral'
        });
        this.defineProperty('showGrid', {
            label: 'Mostrar grelha', type: 'checkbox', value: false, group: 'Geral'
        });
    }

    // métodos principais

    // cada subclasse tem de fazer o seu draw
    draw() {
        throw new Error('Método draw() deve ser implementado pela subclasse.');
    }

    // atualiza o tempo e o contador de frames
    update(deltaTime = 1 / 60) {
        this.frameCount++;
        this.time += deltaTime;
        if (this.useDemoData) this.generateDemoData();
    }

    // guarda o novo tamanho do canvas
    resize(width, height) {
        this.width = width;
        this.height = height;
        if (typeof this.onResize === 'function') this.onResize(width, height);
    }

    // devolve as propriedades com a informação toda (para o painel)
    getProperties() {
        const result = {};
        for (const key of Object.keys(this.propertyDefinitions)) {
            result[key] = { ...this.propertyDefinitions[key], value: this.properties[key] };
        }
        return result;
    }

    // devolve só os valores (usado nos presets)
    getPropertyValues() {
        return { ...this.properties };
    }

    // muda o valor de uma propriedade e verifica se é válido
    updateProperty(property, value) {
        if (!Object.prototype.hasOwnProperty.call(this.properties, property)) return false;

        const def = this.propertyDefinitions[property];
        if (def) {
            // os números ficam entre o min e o max
            if (def.type === 'range') {
                value = Number(value);
                if (Number.isNaN(value)) return false;
                value = Math.min(def.max, Math.max(def.min, value));
            } else if (def.type === 'checkbox') {
                value = Boolean(value);
            } else if (def.type === 'select' && !def.options.some(o => o.value === value)) {
                return false;
            }
        }

        this.properties[property] = value;
        if (typeof this.onPropertyChange === 'function') this.onPropertyChange(property, value);
        return true;
    }

    // cria uma propriedade nova
    defineProperty(key, definition) {
        const { value, ...meta } = definition;
        this.propertyDefinitions[key] = meta;
        this.properties[key] = value;
    }

    // dados do áudio

    // devolve os dados das frequências (ou de teste nas miniaturas)
    getFrequencyData() {
        if (this.useDemoData && !(this.audioProcessor && this.audioProcessor.isPlaying)) return this.testData;
        if (this.audioProcessor && this.audioProcessor.frequencyData.length) return this.audioProcessor.getFrequencyData();
        return AudioVisualization.SILENT_FREQUENCY;
    }

    // devolve os dados da onda (ou de teste nas miniaturas)
    getWaveformData() {
        if (this.useDemoData && !(this.audioProcessor && this.audioProcessor.isPlaying)) return this.testWave;
        if (this.audioProcessor && this.audioProcessor.waveformData.length) return this.audioProcessor.getWaveformData();
        return AudioVisualization.SILENT_WAVEFORM;
    }

    // nível do som entre 0 e 1
    getAudioLevel() {
        if (this.useDemoData && !(this.audioProcessor && this.audioProcessor.isPlaying)) {
            return 0.35 + Math.sin(this.time * 3) * 0.2;
        }
        return this.audioProcessor ? this.audioProcessor.level : 0;
    }

    // cria dados falsos que vão mudando, para as miniaturas
    generateDemoData() {
        const t = this.time;
        const n = this.testData.length;
        const beat = Math.pow(Math.max(0, Math.sin(t * 4)), 6);
        for (let i = 0; i < n; i++) {
            const x = i / n;
            const base = Math.exp(-x * 5) * (0.75 + beat * 0.25);
            const ripple = 0.25 * (0.5 + 0.5 * Math.sin(x * 40 - t * 5)) * Math.exp(-x * 2);
            this.testData[i] = Math.min(255, (base + ripple) * 230);
        }
        const m = this.testWave.length;
        for (let i = 0; i < m; i++) {
            const p = i / m * Math.PI * 2;
            const v = Math.sin(p * 3 + t * 6) * 0.4 + Math.sin(p * 11 - t * 9) * 0.15 * (0.5 + beat);
            this.testWave[i] = 128 + v * 127;
        }
    }

    // junta os dados da FFT em count barras com valores entre 0 e 1
    // e aplica a sensibilidade
    normalizeData(data, count, logScale = true) {
        const result = new Float32Array(count);
        if (!data || !data.length) return result;

        // as frequências muito altas quase não têm som, por isso ignoramos
        const usable = Math.max(2, Math.floor(data.length * 0.7));
        const sensitivity = this.properties.sensitivity || 1;

        // esta fórmula dá mais espaço aos graves (escala logarítmica)
        const k = 3;
        const position = (t) => logScale
            ? usable * (Math.exp(k * t) - 1) / (Math.exp(k) - 1)
            : usable * t;

        for (let i = 0; i < count; i++) {
            const from = position(i / count);
            const to = position((i + 1) / count);
            let avg;

            if (to - from < 1) {
                // se a barra for mais pequena que um valor, faz a média entre os dois vizinhos
                const center = Math.min(usable - 1.001, (from + to) / 2);
                const j = Math.floor(center);
                const frac = center - j;
                avg = (data[j] * (1 - frac) + data[j + 1] * frac) / 255;
            } else {
                // senão faz a média dos valores que ficam na barra
                const start = Math.floor(from);
                const end = Math.min(usable, Math.ceil(to));
                let sum = 0;
                for (let j = start; j < end; j++) sum += data[j];
                avg = sum / (end - start) / 255;
            }
            result[i] = Math.min(1, avg * sensitivity);
        }
        return result;
    }

    // suaviza os valores: sobem rápido e descem devagar
    smoothValues(target) {
        if (this.smoothed.length !== target.length) {
            this.smoothed = new Float32Array(target.length);
        }
        const smoothing = this.properties.smoothing;
        for (let i = 0; i < target.length; i++) {
            const current = this.smoothed[i];
            const factor = target[i] > current ? Math.min(0.9, 1 - smoothing * 0.5) : 1 - smoothing;
            this.smoothed[i] = current + (target[i] - current) * factor;
        }
        return this.smoothed;
    }

    // desenho

    // pinta o fundo todo com a cor de fundo
    // se alpha for menor que 1 fica um rasto
    clearCanvas(alpha = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.properties.backgroundColor || '#000';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();

        if (this.properties.showGrid) this.drawGrid();
    }

    // desenha uma grelha de linhas no fundo
    drawGrid(spacing = 40) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= this.width; x += spacing) {
            ctx.moveTo(Math.round(x) + 0.5, 0);
            ctx.lineTo(Math.round(x) + 0.5, this.height);
        }
        for (let y = 0; y <= this.height; y += spacing) {
            ctx.moveTo(0, Math.round(y) + 0.5);
            ctx.lineTo(this.width, Math.round(y) + 0.5);
        }
        ctx.stroke();
        ctx.restore();
    }

    // cria um gradiente com as cores dadas
    createGradient(colors = ['#4cc9f0', '#f72585'], x0 = 0, y0 = this.height, x1 = 0, y1 = 0) {
        const gradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
        colors.forEach((color, i) => {
            gradient.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), color);
        });
        return gradient;
    }

    // funções de cores

    // converte uma cor #rrggbb para r, g, b
    static hexToRgb(hex) {
        const clean = hex.replace('#', '');
        const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
        const num = parseInt(full, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    // mistura duas cores (t entre 0 e 1)
    static mixColors(hexA, hexB, t) {
        const a = AudioVisualization.hexToRgb(hexA);
        const b = AudioVisualization.hexToRgb(hexB);
        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bl = Math.round(a.b + (b.b - a.b) * t);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    // devolve a cor com transparência
    static withAlpha(hex, alpha) {
        const { r, g, b } = AudioVisualization.hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// arrays de silêncio usados quando ainda não há áudio
AudioVisualization.SILENT_FREQUENCY = new Uint8Array(1024);
AudioVisualization.SILENT_WAVEFORM = new Uint8Array(2048).fill(128);
