// Sistema de partículas que reage ao som
// cada partícula segue uma frequência e nas batidas dos graves saem partículas do centro
class ParticleVisualization extends AudioVisualization {
    constructor(canvas, audioProcessor) {
        super(canvas, audioProcessor);
        this.name = 'Partículas';
        // partículas normais
        this.particles = [];
        // partículas das explosões
        this.bursts = [];
        // últimos valores dos graves para detetar batidas
        this.bassHistory = [];
        this.beatCooldown = 0;
        this.beatFlash = 0;
        // energia de cada banda de frequência
        this.bands = new Float32Array(0);

        // fundo mais escuro nesta visualização
        this.properties.backgroundColor = '#05060f';

        // propriedades desta visualização
        this.defineProperty('particleCount', {
            label: 'Número de partículas', type: 'range', value: 120, min: 20, max: 400, step: 10, group: 'Partículas'
        });
        this.defineProperty('particleSize', {
            label: 'Tamanho', type: 'range', value: 2.5, min: 0.5, max: 8, step: 0.5, group: 'Partículas'
        });
        this.defineProperty('speed', {
            label: 'Velocidade', type: 'range', value: 1, min: 0.1, max: 4, step: 0.1, group: 'Partículas'
        });
        this.defineProperty('colorMode', {
            label: 'Modo de cor', type: 'select', value: 'spectrum', group: 'Cores',
            options: [
                { value: 'spectrum', label: 'Espectro (por frequência)' },
                { value: 'gradient', label: 'Gradiente (2 cores)' },
                { value: 'single', label: 'Cor única' }
            ]
        });
        this.defineProperty('colorA', {
            label: 'Cor A', type: 'color', value: '#4cc9f0', group: 'Cores'
        });
        this.defineProperty('colorB', {
            label: 'Cor B', type: 'color', value: '#f72585', group: 'Cores'
        });
        this.defineProperty('connections', {
            label: 'Mostrar ligações', type: 'checkbox', value: true, group: 'Efeitos'
        });
        this.defineProperty('connectionDistance', {
            label: 'Distância das ligações', type: 'range', value: 90, min: 30, max: 200, step: 5, group: 'Efeitos'
        });
        this.defineProperty('trails', {
            label: 'Rasto', type: 'range', value: 0.3, min: 0, max: 0.9, step: 0.05, group: 'Efeitos'
        });
        this.defineProperty('beatBursts', {
            label: 'Explosões nas batidas', type: 'checkbox', value: true, group: 'Efeitos'
        });

        // criar as partículas iniciais
        this.initParticles();
    }

    // cria as partículas todas
    initParticles() {
        this.particles = [];
        for (let i = 0; i < this.properties.particleCount; i++) {
            this.particles.push(this.createParticle());
        }
    }

    // cria uma partícula com posição e direção aleatórias
    createParticle() {
        const angle = Math.random() * Math.PI * 2;
        const speed = 15 + Math.random() * 35; // pixels por segundo
        return {
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * 0.8 + 0.6,  // tamanho
            band: Math.random(),               // frequência que segue (0 graves, 1 agudos)
            energy: 0
        };
    }

    onResize(width, height) {
        // quando o canvas muda de tamanho as partículas mudam de posição na mesma proporção
        if (!this.lastSize) this.lastSize = { width, height };
        const sx = width / (this.lastSize.width || width);
        const sy = height / (this.lastSize.height || height);
        for (const p of this.particles) { p.x *= sx; p.y *= sy; }
        this.lastSize = { width, height };
    }

    // quando muda o número de partículas adiciona ou remove
    onPropertyChange(property, value) {
        if (property === 'particleCount') {
            while (this.particles.length < value) this.particles.push(this.createParticle());
            if (this.particles.length > value) this.particles.length = value;
        }
    }

    // atualiza as bandas, as batidas e as partículas
    update(deltaTime) {
        super.update(deltaTime);
        this.bands = this.smoothValues(this.normalizeData(this.getFrequencyData(), 32, true));
        this.detectBeat(deltaTime);
        this.updateParticles(deltaTime);
        this.updateBursts(deltaTime);
    }

    // deteta batidas: quando os graves estão bem acima da média
    detectBeat(deltaTime) {
        const bass = (this.bands[0] + this.bands[1] + this.bands[2] + this.bands[3]) / 4;
        this.bassHistory.push(bass);
        if (this.bassHistory.length > 45) this.bassHistory.shift();
        const avg = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;

        this.beatCooldown -= deltaTime;
        this.beatFlash = Math.max(0, this.beatFlash - deltaTime * 3);

        // houve uma batida
        if (bass > 0.35 && bass > avg * 1.25 && this.beatCooldown <= 0) {
            this.beatCooldown = 0.25;
            this.beatFlash = 1;
            if (this.properties.beatBursts) this.spawnBurst(bass);
        }
    }

    // cria várias partículas a sair do centro
    spawnBurst(strength) {
        const count = Math.floor((this.quality === 'low' ? 12 : 28) * strength);
        const cx = this.width / 2;
        const cy = this.height / 2;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (120 + Math.random() * 260) * this.properties.speed;
            this.bursts.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                band: Math.random() * 0.3
            });
        }
        // limite para não ficar lento
        if (this.bursts.length > 400) this.bursts.splice(0, this.bursts.length - 400);
    }

    // move as partículas conforme o som
    updateParticles(deltaTime) {
        const { speed } = this.properties;
        const level = this.getAudioLevel();
        const w = this.width;
        const h = this.height;

        for (const p of this.particles) {
            const bandIndex = Math.min(this.bands.length - 1, Math.floor(p.band * this.bands.length));
            const intensity = this.bands[bandIndex] || 0;
            p.energy += (intensity - p.energy) * 0.3;

            // quanto mais som, mais rápido
            const boost = speed * (1 + p.energy * 4 + level * 2);
            p.x += p.vx * boost * deltaTime;
            p.y += p.vy * boost * deltaTime;

            // um pouco de movimento aleatório
            p.vx += (Math.random() - 0.5) * p.energy * 400 * deltaTime;
            p.vy += (Math.random() - 0.5) * p.energy * 400 * deltaTime;

            // limitar a velocidade
            const v = Math.hypot(p.vx, p.vy);
            if (v > 60) { p.vx = p.vx / v * 60; p.vy = p.vy / v * 60; }
            if (v < 10) { p.vx *= 1.1; p.vy *= 1.1; }

            // bater nas bordas e voltar para trás
            if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
            if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }
            if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
            if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
        }
    }

    // move as partículas das explosões e vai-as apagando
    updateBursts(deltaTime) {
        for (const b of this.bursts) {
            b.x += b.vx * deltaTime;
            b.y += b.vy * deltaTime;
            // vão abrandando
            b.vx *= 0.97;
            b.vy *= 0.97;
            b.life -= deltaTime * 0.9;
        }
        this.bursts = this.bursts.filter(b => b.life > 0);
    }

    // devolve a cor da partícula conforme o modo de cor
    getParticleColor(band, alpha = 1) {
        const { colorMode, colorA, colorB } = this.properties;
        if (colorMode === 'spectrum') {
            return `hsla(${200 + band * 160}, 95%, 60%, ${alpha})`;
        }
        if (colorMode === 'gradient') {
            return AudioVisualization.mixColors(colorA, colorB, band).replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        }
        return AudioVisualization.withAlpha(colorA, alpha);
    }

    draw() {
        // limpar com fundo meio transparente para deixar rasto
        this.clearCanvas(1 - this.properties.trails);

        // brilho no centro quando há batida
        if (this.beatFlash > 0) {
            const ctx = this.ctx;
            const r = Math.max(this.width, this.height) * 0.6;
            const glow = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, r);
            glow.addColorStop(0, this.getParticleColor(0.1, 0.18 * this.beatFlash));
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        if (this.properties.connections) this.drawConnections();
        this.drawParticles();
        this.drawBursts();
    }

    // desenha cada partícula como um círculo
    drawParticles() {
        const ctx = this.ctx;
        const size = this.properties.particleSize;
        for (const p of this.particles) {
            // fica maior quando tem mais energia
            const r = size * p.radius * (1 + p.energy * 2.5);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = this.getParticleColor(p.band, 0.55 + p.energy * 0.45);
            ctx.fill();
        }
    }

    // desenha as partículas das explosões
    drawBursts() {
        const ctx = this.ctx;
        const size = this.properties.particleSize;
        for (const b of this.bursts) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, size * 0.8 * b.life + 0.5, 0, Math.PI * 2);
            ctx.fillStyle = this.getParticleColor(b.band, b.life);
            ctx.fill();
        }
    }

    // desenha linhas entre partículas que estão perto
    // as linhas ficam em 4 grupos de transparência para desenhar mais rápido
    drawConnections() {
        const ctx = this.ctx;
        const maxDist = this.properties.connectionDistance;
        const maxDistSq = maxDist * maxDist;
        // em qualidade baixa só ligamos as primeiras 120
        const n = this.quality === 'low' ? Math.min(120, this.particles.length) : this.particles.length;
        const buckets = [[], [], [], []];

        for (let i = 0; i < n; i++) {
            const a = this.particles[i];
            for (let j = i + 1; j < n; j++) {
                const b = this.particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < maxDistSq) {
                    // quanto mais perto, mais visível
                    const t = 1 - Math.sqrt(d2) / maxDist;
                    buckets[Math.min(3, Math.floor(t * 4))].push(a.x, a.y, b.x, b.y);
                }
            }
        }

        ctx.save();
        ctx.lineWidth = 1;
        const color = this.properties.colorA;
        // desenhar cada grupo de linhas
        buckets.forEach((lines, level) => {
            if (!lines.length) return;
            ctx.strokeStyle = AudioVisualization.withAlpha(color, 0.08 + level * 0.12);
            ctx.beginPath();
            for (let k = 0; k < lines.length; k += 4) {
                ctx.moveTo(lines[k], lines[k + 1]);
                ctx.lineTo(lines[k + 2], lines[k + 3]);
            }
            ctx.stroke();
        });
        ctx.restore();
    }
}
