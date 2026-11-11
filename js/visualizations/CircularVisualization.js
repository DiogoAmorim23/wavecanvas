// Funcionalidade avançada: espectro circular que roda
// as barras ficam à volta de um círculo que pulsa com os graves
class CircularVisualization extends AudioVisualization {
    constructor(canvas, audioProcessor) {
        super(canvas, audioProcessor);
        this.name = 'Espectro Circular';
        // ângulo atual da rotação
        this.rotation = 0;
        // quanto o círculo cresce com os graves
        this.pulse = 0;

        // fundo desta visualização
        this.properties.backgroundColor = '#080a1a';

        // propriedades desta visualização
        this.defineProperty('barCount', {
            label: 'Número de barras', type: 'range', value: 96, min: 24, max: 256, step: 8, group: 'Forma'
        });
        this.defineProperty('innerRadius', {
            label: 'Raio interior', type: 'range', value: 0.22, min: 0.05, max: 0.4, step: 0.01, group: 'Forma'
        });
        this.defineProperty('barLength', {
            label: 'Comprimento das barras', type: 'range', value: 0.55, min: 0.1, max: 1, step: 0.05, group: 'Forma'
        });
        this.defineProperty('barWidth', {
            label: 'Espessura das barras', type: 'range', value: 0.6, min: 0.1, max: 1, step: 0.05, group: 'Forma'
        });
        this.defineProperty('symmetric', {
            label: 'Simétrico', type: 'checkbox', value: true, group: 'Forma'
        });
        this.defineProperty('rotationSpeed', {
            label: 'Velocidade de rotação', type: 'range', value: 0.3, min: -3, max: 3, step: 0.05, group: 'Movimento'
        });
        this.defineProperty('audioRotation', {
            label: 'Rotação reage ao som', type: 'checkbox', value: true, group: 'Movimento'
        });
        this.defineProperty('colorInner', {
            label: 'Cor interior', type: 'color', value: '#7209b7', group: 'Cores'
        });
        this.defineProperty('colorOuter', {
            label: 'Cor exterior', type: 'color', value: '#4cc9f0', group: 'Cores'
        });
        this.defineProperty('glow', {
            label: 'Brilho (glow)', type: 'range', value: 10, min: 0, max: 40, step: 1, group: 'Efeitos'
        });
        this.defineProperty('centerPulse', {
            label: 'Pulsar centro (graves)', type: 'checkbox', value: true, group: 'Efeitos'
        });
    }

    // calcula as barras, a rotação e o pulsar
    update(deltaTime) {
        super.update(deltaTime);
        const { barCount, symmetric, rotationSpeed, audioRotation } = this.properties;

        // no modo simétrico só calculamos metade das barras
        const count = symmetric ? Math.ceil(barCount / 2) : barCount;
        this.smoothValues(this.normalizeData(this.getFrequencyData(), count, true));

        // a rotação fica mais rápida com som alto
        const level = this.getAudioLevel();
        const speed = rotationSpeed * (audioRotation ? 1 + level * 3 : 1);
        this.rotation = (this.rotation + speed * deltaTime) % (Math.PI * 2);

        // média dos graves para o círculo pulsar
        const bass = this.smoothed.length ? (this.smoothed[0] + this.smoothed[1] + (this.smoothed[2] || 0)) / 3 : 0;
        this.pulse += (bass - this.pulse) * 0.25;
    }

    // valor de uma barra, no modo simétrico a segunda metade repete a primeira
    getBarValue(i, total) {
        const values = this.smoothed;
        if (!this.properties.symmetric) return values[i] || 0;
        const half = values.length;
        const idx = i < half ? i : total - 1 - i;
        return values[Math.max(0, Math.min(half - 1, idx))] || 0;
    }

    // desenha as barras à volta do círculo
    draw() {
        this.clearCanvas();
        const ctx = this.ctx;
        const { barCount, innerRadius, barLength, barWidth, colorInner, colorOuter, glow, centerPulse } = this.properties;

        // centro e tamanhos
        const cx = this.width / 2;
        const cy = this.height / 2;
        const minDim = Math.min(this.width, this.height);
        const baseRadius = minDim * innerRadius * (centerPulse ? 1 + this.pulse * 0.25 : 1);
        const maxLength = minDim * 0.5 * barLength;
        const angleStep = (Math.PI * 2) / barCount;
        const thickness = Math.max(1, baseRadius * angleStep * barWidth);

        // mudar a origem para o centro e rodar
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation - Math.PI / 2);
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        if (glow > 0 && this.quality === 'high') {
            ctx.shadowBlur = glow;
            ctx.shadowColor = colorOuter;
        }

        // gradiente do centro para fora
        const local = ctx.createRadialGradient(0, 0, baseRadius, 0, 0, baseRadius + maxLength);
        local.addColorStop(0, colorInner);
        local.addColorStop(1, colorOuter);
        ctx.strokeStyle = local;

        // cada barra é uma linha do círculo para fora
        ctx.beginPath();
        for (let i = 0; i < barCount; i++) {
            const value = this.getBarValue(i, barCount);
            const length = Math.max(2, value * maxLength);
            const angle = i * angleStep;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            ctx.moveTo(cos * baseRadius, sin * baseRadius);
            ctx.lineTo(cos * (baseRadius + length), sin * (baseRadius + length));
        }
        ctx.stroke();
        ctx.restore();

        // círculo do meio
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius - thickness, 0, Math.PI * 2);
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius);
        core.addColorStop(0, AudioVisualization.withAlpha(colorOuter, 0.15 + this.pulse * 0.5));
        core.addColorStop(1, AudioVisualization.withAlpha(colorInner, 0.05));
        ctx.fillStyle = core;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = AudioVisualization.withAlpha(colorInner, 0.8);
        ctx.stroke();
        ctx.restore();
    }
}
