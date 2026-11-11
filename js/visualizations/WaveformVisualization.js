// Forma de onda do som
class WaveformVisualization extends AudioVisualization {
    constructor(canvas, audioProcessor) {
        super(canvas, audioProcessor);
        this.name = 'Forma de Onda';
        // pontos da onda
        this.points = new Float32Array(0);
        // ondas anteriores para fazer o rasto
        this.history = [];

        // aqui a suavização começa mais baixa
        this.properties.smoothing = 0.3;

        // propriedades desta visualização
        this.defineProperty('lineWidth', {
            label: 'Espessura da linha', type: 'range', value: 3, min: 1, max: 12, step: 0.5, group: 'Traço'
        });
        this.defineProperty('lineStyle', {
            label: 'Estilo do traço', type: 'select', value: 'solid', group: 'Traço',
            options: [
                { value: 'solid', label: 'Contínuo' },
                { value: 'dashed', label: 'Tracejado' },
                { value: 'dotted', label: 'Pontilhado' }
            ]
        });
        this.defineProperty('mode', {
            label: 'Modo', type: 'select', value: 'line', group: 'Traço',
            options: [
                { value: 'line', label: 'Linha' },
                { value: 'filled', label: 'Preenchido' },
                { value: 'mirror', label: 'Espelhado' }
            ]
        });
        this.defineProperty('colorStart', {
            label: 'Cor inicial', type: 'color', value: '#4cc9f0', group: 'Cores'
        });
        this.defineProperty('colorEnd', {
            label: 'Cor final', type: 'color', value: '#b5179e', group: 'Cores'
        });
        this.defineProperty('glow', {
            label: 'Brilho (glow)', type: 'range', value: 12, min: 0, max: 40, step: 1, group: 'Efeitos'
        });
        this.defineProperty('trails', {
            label: 'Rasto (ondas anteriores)', type: 'range', value: 4, min: 0, max: 12, step: 1, group: 'Efeitos'
        });
        this.defineProperty('stabilize', {
            label: 'Estabilizar (trigger)', type: 'checkbox', value: true, group: 'Efeitos'
        });
    }

    // calcula os pontos da onda
    update(deltaTime) {
        super.update(deltaTime);

        const data = this.getWaveformData();
        // o número de pontos depende da largura do canvas
        const count = Math.max(64, Math.min(1024, Math.floor(this.width / 2)));
        const sensitivity = this.properties.sensitivity;

        // para a onda não saltar, começamos no ponto onde ela passa pelo meio a subir
        let start = 0;
        const searchWindow = Math.floor(data.length / 2);
        if (this.properties.stabilize) {
            for (let i = 1; i < searchWindow; i++) {
                if (data[i - 1] < 128 && data[i] >= 128) { start = i; break; }
            }
        }
        const span = data.length - searchWindow;

        if (this.points.length !== count) this.points = new Float32Array(count);

        const smoothing = this.properties.smoothing;
        for (let i = 0; i < count; i++) {
            const idx = start + Math.floor(i / count * span);
            const target = Math.max(-1, Math.min(1, ((data[idx] - 128) / 128) * sensitivity));
            // aproxima o ponto do valor novo aos poucos
            this.points[i] += (target - this.points[i]) * (1 - smoothing);
        }

        // guardar a onda para o rasto
        const maxTrails = this.quality === 'low' ? Math.min(2, this.properties.trails) : this.properties.trails;
        if (maxTrails > 0 && this.frameCount % 2 === 0) {
            this.history.unshift(Float32Array.from(this.points));
        }
        // apagar as ondas mais antigas
        if (this.history.length > maxTrails) this.history.length = maxTrails;
    }

    // desenha a onda e o rasto
    draw() {
        this.clearCanvas();
        this.drawCenterLine();

        const ctx = this.ctx;
        const { colorStart, colorEnd, lineWidth, glow, mode } = this.properties;
        const stroke = this.createGradient([colorStart, colorEnd], 0, 0, this.width, 0);

        // rasto: ondas antigas cada vez mais transparentes
        ctx.save();
        ctx.lineWidth = Math.max(1, lineWidth * 0.6);
        ctx.strokeStyle = stroke;
        this.history.forEach((points, i) => {
            ctx.globalAlpha = 0.35 * (1 - (i + 1) / (this.history.length + 1));
            this.tracePath(points, 1 + (i + 1) * 0.04);
            ctx.stroke();
        });
        ctx.restore();

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.setLineDash(this.getDashPattern());

        // brilho à volta da linha
        if (glow > 0 && this.quality === 'high') {
            ctx.shadowBlur = glow;
            ctx.shadowColor = colorStart;
        }

        // desenhar conforme o modo
        if (mode === 'filled') {
            this.tracePath(this.points);
            ctx.lineTo(this.width, this.height / 2);
            ctx.lineTo(0, this.height / 2);
            ctx.closePath();
            const fill = this.createGradient([
                AudioVisualization.withAlpha(colorStart, 0.45),
                AudioVisualization.withAlpha(colorEnd, 0.45)
            ], 0, 0, this.width, 0);
            ctx.fillStyle = fill;
            ctx.fill();
            this.tracePath(this.points);
            ctx.stroke();
        } else if (mode === 'mirror') {
            this.tracePath(this.points, 1);
            ctx.stroke();
            ctx.globalAlpha = 0.6;
            this.tracePath(this.points, -1);
            ctx.stroke();
        } else {
            this.tracePath(this.points);
            ctx.stroke();
        }
        ctx.restore();
    }

    // cria o caminho da onda no canvas
    tracePath(points, scale = 1) {
        const ctx = this.ctx;
        const mid = this.height / 2;
        const amp = this.height * 0.45 * scale;
        const step = this.width / (points.length - 1);

        ctx.beginPath();
        ctx.moveTo(0, mid + points[0] * amp);
        // usamos curvas para a linha ficar mais suave
        for (let i = 1; i < points.length - 1; i++) {
            const x = i * step;
            const y = mid + points[i] * amp;
            const nx = (i + 1) * step;
            const ny = mid + points[i + 1] * amp;
            ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        ctx.lineTo(this.width, mid + points[points.length - 1] * amp);
    }

    // linha no meio do canvas
    drawCenterLine() {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.height / 2);
        ctx.lineTo(this.width, this.height / 2);
        ctx.stroke();
        ctx.restore();
    }

    // padrão do traço (contínuo, tracejado ou pontilhado)
    getDashPattern() {
        const w = this.properties.lineWidth;
        switch (this.properties.lineStyle) {
            case 'dashed': return [w * 4, w * 2.5];
            case 'dotted': return [0.1, w * 2.2];
            default: return [];
        }
    }
}
