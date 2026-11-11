// Espectro de frequências com barras
class SpectrumVisualization extends AudioVisualization {
    constructor(canvas, audioProcessor) {
        super(canvas, audioProcessor);
        this.name = 'Espectro de Frequências';
        // altura dos picos de cada barra
        this.peaks = new Float32Array(0);
        // tempo que cada pico fica parado
        this.peakHold = new Float32Array(0);

        // propriedades desta visualização
        this.defineProperty('barCount', {
            label: 'Número de barras', type: 'range', value: 64, min: 16, max: 256, step: 8, group: 'Barras'
        });
        this.defineProperty('barGap', {
            label: 'Espaço entre barras', type: 'range', value: 0.25, min: 0, max: 0.8, step: 0.05, group: 'Barras'
        });
        this.defineProperty('mode', {
            label: 'Modo', type: 'select', value: 'bars', group: 'Barras',
            options: [
                { value: 'bars', label: 'Barras' },
                { value: 'mirror', label: 'Espelhado (centro)' },
                { value: 'blocks', label: 'Blocos (LED)' }
            ]
        });
        this.defineProperty('logScale', {
            label: 'Escala logarítmica', type: 'checkbox', value: true, group: 'Barras'
        });
        this.defineProperty('colorLow', {
            label: 'Cor base', type: 'color', value: '#4361ee', group: 'Cores'
        });
        this.defineProperty('colorMid', {
            label: 'Cor intermédia', type: 'color', value: '#4cc9f0', group: 'Cores'
        });
        this.defineProperty('colorHigh', {
            label: 'Cor topo', type: 'color', value: '#f72585', group: 'Cores'
        });
        this.defineProperty('showPeaks', {
            label: 'Mostrar picos', type: 'checkbox', value: true, group: 'Efeitos'
        });
        this.defineProperty('reflection', {
            label: 'Reflexo', type: 'checkbox', value: true, group: 'Efeitos'
        });
    }

    // calcula os valores das barras e dos picos
    update(deltaTime) {
        super.update(deltaTime);

        const raw = this.normalizeData(this.getFrequencyData(), this.properties.barCount, this.properties.logScale);
        const values = this.smoothValues(raw);

        // criar os arrays outra vez se o número de barras mudou
        if (this.peaks.length !== values.length) {
            this.peaks = new Float32Array(values.length);
            this.peakHold = new Float32Array(values.length);
        }

        // os picos sobem logo, ficam parados um bocado e depois caem
        for (let i = 0; i < values.length; i++) {
            if (values[i] >= this.peaks[i]) {
                this.peaks[i] = values[i];
                this.peakHold[i] = 0.4;
            } else if (this.peakHold[i] > 0) {
                this.peakHold[i] -= deltaTime;
            } else {
                this.peaks[i] = Math.max(0, this.peaks[i] - deltaTime * 0.6);
            }
        }
    }

    // desenha conforme o modo escolhido
    draw() {
        this.clearCanvas();

        const { mode, reflection } = this.properties;
        const values = this.smoothed;
        if (!values.length) return;

        if (mode === 'mirror') {
            this.drawMirror(values);
        } else {
            const floor = reflection ? this.height * 0.8 : this.height;
            this.drawBars(values, floor, mode === 'blocks');
            if (reflection) this.drawReflection(floor);
        }
    }

    // desenha as barras normais ou em blocos
    drawBars(values, floor, blocks) {
        const ctx = this.ctx;
        const { barGap, colorLow, colorMid, colorHigh, showPeaks } = this.properties;
        const slot = this.width / values.length;
        const barWidth = Math.max(1, slot * (1 - barGap));
        const maxHeight = floor * 0.95;

        ctx.fillStyle = this.createGradient([colorLow, colorMid, colorHigh], 0, floor, 0, floor - maxHeight);

        // modo LED: cada barra é feita de vários blocos
        if (blocks) {
            const blockH = Math.max(3, maxHeight / 32);
            for (let i = 0; i < values.length; i++) {
                const x = i * slot + (slot - barWidth) / 2;
                const count = Math.floor(values[i] * maxHeight / blockH);
                for (let b = 0; b < count; b++) {
                    ctx.fillRect(x, floor - (b + 1) * blockH, barWidth, blockH - 1.5);
                }
            }
        } else {
            for (let i = 0; i < values.length; i++) {
                const h = values[i] * maxHeight;
                const x = i * slot + (slot - barWidth) / 2;
                ctx.fillRect(x, floor - h, barWidth, h);
            }
        }

        // desenhar os picos
        if (showPeaks) {
            ctx.fillStyle = colorHigh;
            for (let i = 0; i < this.peaks.length; i++) {
                if (this.peaks[i] < 0.01) continue;
                const x = i * slot + (slot - barWidth) / 2;
                ctx.fillRect(x, floor - this.peaks[i] * maxHeight - 3, barWidth, 2);
            }
        }
    }

    // reflexo: copia as barras viradas ao contrário e mais transparentes
    drawReflection(floor) {
        const ctx = this.ctx;
        const reflectHeight = this.height - floor;
        // o canvas real pode ter mais pixels por causa do ecrã
        const dpr = this.canvas.width / this.width || 1;

        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.translate(0, floor * 2);
        ctx.scale(1, -1);
        ctx.drawImage(
            this.canvas,
            0, (floor - reflectHeight) * dpr, this.canvas.width, reflectHeight * dpr,
            0, floor - reflectHeight, this.width, reflectHeight
        );
        ctx.restore();

        // o reflexo vai desaparecendo para baixo
        const fade = ctx.createLinearGradient(0, floor, 0, this.height);
        fade.addColorStop(0, AudioVisualization.withAlpha(this.properties.backgroundColor, 0.2));
        fade.addColorStop(1, AudioVisualization.withAlpha(this.properties.backgroundColor, 1));
        ctx.fillStyle = fade;
        ctx.fillRect(0, floor, this.width, reflectHeight);
    }

    // barras a crescer a partir do meio para cima e para baixo
    drawMirror(values) {
        const ctx = this.ctx;
        const { barGap, colorLow, colorMid, colorHigh, showPeaks } = this.properties;
        const center = this.height / 2;
        const slot = this.width / values.length;
        const barWidth = Math.max(1, slot * (1 - barGap));
        const maxHalf = center * 0.95;

        ctx.fillStyle = this.createGradient([colorHigh, colorMid, colorLow, colorMid, colorHigh], 0, center - maxHalf, 0, center + maxHalf);
        for (let i = 0; i < values.length; i++) {
            const h = Math.max(1, values[i] * maxHalf);
            const x = i * slot + (slot - barWidth) / 2;
            ctx.fillRect(x, center - h, barWidth, h * 2);
        }

        // desenhar os picos em cima e em baixo
        if (showPeaks) {
            ctx.fillStyle = colorHigh;
            for (let i = 0; i < this.peaks.length; i++) {
                if (this.peaks[i] < 0.01) continue;
                const x = i * slot + (slot - barWidth) / 2;
                const h = this.peaks[i] * maxHalf;
                ctx.fillRect(x, center - h - 3, barWidth, 2);
                ctx.fillRect(x, center + h + 1, barWidth, 2);
            }
        }
    }
}
