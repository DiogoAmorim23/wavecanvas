// Funcionalidade avançada: sistema de presets
// tem presets já feitos e os do utilizador ficam guardados no localStorage
class PresetManager {
    constructor(visualizationEngine) {
        this.visualizationEngine = visualizationEngine;
        this.storageKey = 'wavecanvas.userPresets';
        this.builtInPresets = PresetManager.BUILT_IN;
        this.userPresets = this.loadUserPresets();
    }

    // devolve todos os presets
    getAllPresets() {
        return [...this.builtInPresets, ...this.userPresets];
    }

    // procura um preset pelo id
    getPreset(id) {
        return this.getAllPresets().find(p => p.id === id) || null;
    }

    // aplica um preset: muda a visualização e mete os valores do preset
    applyPreset(id) {
        const preset = this.getPreset(id);
        if (!preset) throw new Error('Preset não encontrado.');

        const engine = this.visualizationEngine;
        if (!engine.setVisualization(preset.visualization)) {
            throw new Error(`O preset "${preset.name}" usa uma visualização inexistente (${preset.visualization}).`);
        }

        // primeiro os valores default e depois os do preset por cima
        const defaults = this.getDefaultProperties(preset.visualization);
        const values = { ...defaults, ...preset.properties };
        Object.entries(values).forEach(([key, value]) => engine.updateVisualizationProperty(key, value));
        return preset;
    }

    // cria uma visualização temporária só para ler os valores default
    getDefaultProperties(type) {
        const info = this.visualizationEngine.visualizationTypes.get(type);
        if (!info) return {};
        const temp = new info.VisualizationClass(document.createElement('canvas'), null);
        return temp.getPropertyValues();
    }

    // guarda a configuração atual como um preset novo
    saveCurrentAsPreset(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) throw new Error('Indique um nome para o preset.');

        const engine = this.visualizationEngine;
        const preset = {
            id: `user-${Date.now()}`,
            name: trimmed.slice(0, 40),
            visualization: engine.currentType,
            properties: engine.getVisualizationPropertyValues(),
            builtIn: false
        };
        this.userPresets.push(preset);
        this.persist();
        return preset;
    }

    // apaga um preset do utilizador
    deletePreset(id) {
        const index = this.userPresets.findIndex(p => p.id === id);
        if (index === -1) return false;
        this.userPresets.splice(index, 1);
        this.persist();
        return true;
    }

    // lê os presets guardados no localStorage
    loadUserPresets() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(p => p && p.id && p.visualization) : [];
        } catch (error) {
            console.warn('Não foi possível ler os presets guardados:', error);
            return [];
        }
    }

    // guarda os presets no localStorage
    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.userPresets));
        } catch (error) {
            throw new Error('Não foi possível guardar o preset (armazenamento local indisponível).');
        }
    }
}

// presets que já vêm com a aplicação
PresetManager.BUILT_IN = [
    {
        id: 'neon', name: 'Néon Clássico', visualization: 'spectrum', builtIn: true,
        properties: { colorLow: '#4361ee', colorMid: '#4cc9f0', colorHigh: '#f72585', barCount: 64, mode: 'bars', reflection: true }
    },
    {
        id: 'fire', name: 'Fogo', visualization: 'spectrum', builtIn: true,
        properties: { backgroundColor: '#140504', colorLow: '#9d0208', colorMid: '#f48c06', colorHigh: '#ffba08', barCount: 96, barGap: 0.15, mode: 'mirror', sensitivity: 1.3 }
    },
    {
        id: 'retro-led', name: 'Retro LED', visualization: 'spectrum', builtIn: true,
        properties: { backgroundColor: '#000000', colorLow: '#38b000', colorMid: '#ffd60a', colorHigh: '#d00000', barCount: 32, barGap: 0.3, mode: 'blocks', reflection: false, showGrid: true }
    },
    {
        id: 'ocean', name: 'Oceano', visualization: 'waveform', builtIn: true,
        properties: { backgroundColor: '#03111f', colorStart: '#00b4d8', colorEnd: '#90e0ef', mode: 'filled', lineWidth: 2.5, glow: 18, trails: 6 }
    },
    {
        id: 'oscilloscope', name: 'Osciloscópio', visualization: 'waveform', builtIn: true,
        properties: { backgroundColor: '#001a00', colorStart: '#39ff14', colorEnd: '#39ff14', mode: 'line', lineWidth: 2, glow: 10, trails: 2, stabilize: true, showGrid: true, smoothing: 0 }
    },
    {
        id: 'galaxy', name: 'Galáxia', visualization: 'particles', builtIn: true,
        properties: { backgroundColor: '#02010a', particleCount: 220, particleSize: 2, colorMode: 'gradient', colorA: '#b8c0ff', colorB: '#ff70a6', connectionDistance: 70, trails: 0.6 }
    },
    {
        id: 'hypnotic', name: 'Hipnótico', visualization: 'circular', builtIn: true,
        properties: { backgroundColor: '#0a0014', colorInner: '#ff006e', colorOuter: '#ffbe0b', barCount: 160, rotationSpeed: 0.8, innerRadius: 0.18, barLength: 0.7, glow: 16 }
    }
];
