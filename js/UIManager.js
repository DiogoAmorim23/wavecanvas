// Gestão da interface (botões, painel de propriedades, galeria)
class UIManager {
    constructor(app) {
        this.app = app;
        this.visualizationEngine = app.visualizationEngine;
        this.audioProcessor = app.audioProcessor;

        // guardar os elementos da página para não estar sempre a procurá-los
        this.elements = {
            startMic: document.getElementById('startMic'),
            pauseAudio: document.getElementById('pauseAudio'),
            stopAudio: document.getElementById('stopAudio'),
            audioFile: document.getElementById('audioFile'),
            volume: document.getElementById('volume'),
            loopAudio: document.getElementById('loopAudio'),
            visualizationType: document.getElementById('visualizationType'),
            previews: document.getElementById('visualizationPreviews'),
            presetList: document.getElementById('presetList'),
            presetName: document.getElementById('presetName'),
            savePreset: document.getElementById('savePreset'),
            exportPNG: document.getElementById('exportPNG'),
            exportJPEG: document.getElementById('exportJPEG'),
            jpegQuality: document.getElementById('jpegQuality'),
            jpegQualityValue: document.getElementById('jpegQualityValue'),
            captureScreenshot: document.getElementById('captureScreenshot'),
            gallery: document.getElementById('screenshotGallery'),
            qualityMode: document.getElementById('qualityMode'),
            canvasWrapper: document.getElementById('canvasWrapper'),
            fullscreenBtn: document.getElementById('fullscreenBtn'),
            audioStatus: document.getElementById('audioStatus'),
            audioDetails: document.getElementById('audioDetails'),
            audioLevel: document.getElementById('audioLevel'),
            audioTime: document.getElementById('audioTime'),
            progressBar: document.getElementById('progressBar'),
            levelBar: document.getElementById('levelBar'),
            peakMarker: document.getElementById('peakMarker'),
            statusBadge: document.getElementById('statusBadge'),
            fpsBadge: document.getElementById('fpsBadge'),
            propertiesContainer: document.getElementById('properties-container'),
            propertiesTitle: document.getElementById('propertiesTitle'),
            resetProperties: document.getElementById('resetProperties'),
            errorModal: document.getElementById('errorModal'),
            errorMessage: document.getElementById('errorMessage'),
            toast: document.getElementById('toast')
        };

        // para não atualizar o texto em todos os frames
        this.lastInfoUpdate = 0;
        this.toastTimer = null;

        // montar a interface
        this.populateVisualizationSelect();
        this.buildPreviews();
        this.renderPresets();
        this.setupEventListeners();
        this.setupAudioLevels();
    }

    //visualizações

    // preenche o menu com as visualizações
    populateVisualizationSelect() {
        const select = this.elements.visualizationType;
        select.innerHTML = '';
        this.visualizationEngine.getVisualizationTypes().forEach(({ type, label }, i) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = `${i + 1}. ${label}`;
            select.appendChild(option);
        });
    }

    // cria as miniaturas de cada visualização
    buildPreviews() {
        const container = this.elements.previews;
        container.innerHTML = '';
        this.visualizationEngine.getVisualizationTypes().forEach(({ type, label }) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'preview-card';
            card.dataset.type = type;
            card.title = label;

            const canvas = document.createElement('canvas');
            const caption = document.createElement('span');
            caption.textContent = label;
            card.appendChild(canvas);
            card.appendChild(caption);
            container.appendChild(card);

            card.addEventListener('click', () => this.app.setVisualization(type));
            this.visualizationEngine.registerPreview(type, canvas);
        });
    }

    // marca a visualização escolhida no menu e nas miniaturas
    setActiveVisualization(type) {
        this.elements.visualizationType.value = type;
        this.elements.previews.querySelectorAll('.preview-card').forEach(card => {
            card.classList.toggle('active', card.dataset.type === type);
        });
        const viz = this.visualizationEngine.currentVisualization;
        this.elements.propertiesTitle.textContent = viz ? `— ${viz.name}` : '';
    }

    //propriedades

    // cria os controlos do painel de propriedades
    updatePropertiesPanel() {
        const container = this.elements.propertiesContainer;
        container.innerHTML = '';

        const properties = this.visualizationEngine.getVisualizationProperties();
        // separar as propriedades por grupo
        const groups = new Map();
        Object.entries(properties).forEach(([key, def]) => {
            const group = def.group || 'Outros';
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push([key, def]);
        });

        // o grupo Geral fica no fim
        const ordered = [...groups.entries()].sort(([a], [b]) => (a === 'Geral') - (b === 'Geral'));
        ordered.forEach(([groupName, items]) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'property-group';
            const title = document.createElement('h4');
            title.textContent = groupName;
            groupEl.appendChild(title);
            items.forEach(([key, def]) => groupEl.appendChild(this.createPropertyControl(key, def)));
            container.appendChild(groupEl);
        });
    }

    // cria o controlo certo para cada tipo de propriedade
    createPropertyControl(property, definition) {
        const { label, type, value, min, max, step, options } = definition;
        const container = document.createElement('div');
        container.className = 'property-control';
        const id = `prop-${property}`;

        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;

        let input;
        // muda o valor na visualização
        const apply = (v) => {
            if (!this.visualizationEngine.updateVisualizationProperty(property, v)) {
                this.showError(`Valor inválido para "${label}".`);
            }
        };

        switch (type) {
            case 'checkbox': {
                container.classList.add('checkbox-control');
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = Boolean(value);
                input.addEventListener('change', e => apply(e.target.checked));
                labelEl.appendChild(input);
                labelEl.appendChild(document.createTextNode(label));
                break;
            }
            case 'select': {
                labelEl.textContent = label;
                input = document.createElement('select');
                options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    input.appendChild(o);
                });
                input.value = value;
                input.addEventListener('change', e => apply(e.target.value));
                break;
            }
            case 'color': {
                labelEl.textContent = label;
                input = document.createElement('input');
                input.type = 'color';
                input.value = value;
                input.addEventListener('input', e => apply(e.target.value));
                break;
            }
            // slider para números
            default: {
                const output = document.createElement('output');
                output.textContent = this.formatNumber(value, step);
                labelEl.textContent = label;
                labelEl.appendChild(output);
                input = document.createElement('input');
                input.type = 'range';
                input.min = min;
                input.max = max;
                input.step = step;
                input.value = value;
                input.addEventListener('input', e => {
                    const v = parseFloat(e.target.value);
                    output.textContent = this.formatNumber(v, step);
                    apply(v);
                });
            }
        }

        input.id = id;
        container.appendChild(labelEl);
        if (type !== 'checkbox') container.appendChild(input);
        return container;
    }

    // mostra o número com as casas decimais do step
    formatNumber(value, step = 1) {
        const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
        return Number(value).toFixed(decimals);
    }

    //presets

    // mostra os botões dos presets
    renderPresets() {
        const list = this.elements.presetList;
        list.innerHTML = '';
        this.app.presetManager.getAllPresets().forEach(preset => {
            const chip = document.createElement('span');
            chip.className = `preset-chip${preset.builtIn ? '' : ' user'}`;

            const applyBtn = document.createElement('button');
            applyBtn.type = 'button';
            applyBtn.textContent = preset.name;
            applyBtn.title = `Aplicar preset (${preset.visualization})`;
            applyBtn.addEventListener('click', () => this.app.applyPreset(preset.id));
            chip.appendChild(applyBtn);

            // só os presets do utilizador podem ser apagados
            if (!preset.builtIn) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'delete';
                del.textContent = '×';
                del.title = 'Apagar preset';
                del.addEventListener('click', () => this.app.deletePreset(preset.id));
                chip.appendChild(del);
            }
            list.appendChild(chip);
        });
    }

    //galeria

    // mostra as miniaturas das screenshots
    renderGallery() {
        const gallery = this.elements.gallery;
        gallery.innerHTML = '';
        this.app.exportManager.screenshots.forEach(shot => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.title = `${shot.filename}\nClique para descarregar`;

            const img = document.createElement('img');
            img.src = shot.url;
            img.alt = shot.filename;
            item.appendChild(img);

            const remove = document.createElement('button');
            remove.className = 'remove';
            remove.textContent = '×';
            remove.title = 'Remover';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.exportManager.removeScreenshot(shot.id);
                this.renderGallery();
            });
            item.appendChild(remove);

            // clicar na imagem faz download
            item.addEventListener('click', () => this.app.exportManager.downloadScreenshot(shot.id));
            gallery.appendChild(item);
        });
    }

    //estado

    // atualiza o texto do estado do áudio
    updateAudioInfo(info, isError = false) {
        const { audioStatus, audioDetails, audioLevel } = this.elements;

        if (isError) {
            audioStatus.textContent = `Erro: ${info}`;
            audioStatus.style.color = 'var(--danger)';
            return;
        }

        audioStatus.style.color = '';
        if (info.status) audioStatus.textContent = `Áudio: ${info.status}`;
        if (info.details !== undefined) audioDetails.textContent = info.details;
        if (info.level !== undefined) audioLevel.textContent = `Nível: ${info.level}%`;
    }

    // muda a etiqueta de estado no topo
    setStatusBadge(state) {
        const labels = { idle: 'Parado', live: '● Microfone', playing: '▶ A reproduzir', paused: '⏸ Pausado', loading: 'A carregar…' };
        const badge = this.elements.statusBadge;
        badge.textContent = labels[state] || state;
        badge.className = `badge badge-${state === 'loading' ? 'muted' : state}`;
    }

    // ativa ou desativa os botões conforme o estado
    setButtonStates(playing, paused = false) {
        const { startMic, stopAudio, pauseAudio } = this.elements;
        const isMic = this.audioProcessor.sourceType === 'microphone';
        startMic.disabled = playing && isMic;
        stopAudio.disabled = !playing;
        pauseAudio.disabled = !playing;
        pauseAudio.textContent = paused ? '▶ Retomar' : '⏸ Pausar';
    }

    // bloqueia os botões enquanto carrega
    setLoading(loading) {
        this.elements.startMic.disabled = loading;
        document.querySelectorAll('[data-sample]').forEach(b => { b.disabled = loading; });
        if (loading) this.setStatusBadge('loading');
    }

    // mostra a janela de erro
    showError(message) {
        const { errorModal, errorMessage } = this.elements;
        errorMessage.textContent = message;
        errorModal.classList.remove('hidden');
    }

    // fecha a janela de erro
    hideError() {
        this.elements.errorModal.classList.add('hidden');
    }

    // mostra uma mensagem pequena durante uns segundos
    showToast(message, duration = 2200) {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    //eventos

    // liga os botões às funções da App
    setupEventListeners() {
        const el = this.elements;

        el.startMic.addEventListener('click', () => this.app.startMicrophone());
        el.stopAudio.addEventListener('click', () => this.app.stopAudio());
        el.pauseAudio.addEventListener('click', () => this.app.togglePause());

        el.audioFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.app.loadAudioFile(e.target.files[0]);
            e.target.value = ''; // permite voltar a escolher o mesmo ficheiro
        });

        document.querySelectorAll('[data-sample]').forEach(btn => {
            btn.addEventListener('click', () => this.app.loadSample(btn.dataset.sample));
        });

        el.volume.addEventListener('input', e => this.audioProcessor.setVolume(parseFloat(e.target.value)));
        el.loopAudio.addEventListener('change', e => this.audioProcessor.setLoop(e.target.checked));

        el.visualizationType.addEventListener('change', (e) => this.app.setVisualization(e.target.value));

        el.savePreset.addEventListener('click', () => this.app.savePreset(el.presetName.value));
        el.presetName.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.app.savePreset(el.presetName.value);
        });

        el.exportPNG.addEventListener('click', () => this.app.exportFrame('png'));
        el.exportJPEG.addEventListener('click', () => this.app.exportFrame('jpeg'));
        el.jpegQuality.addEventListener('input', e => {
            el.jpegQualityValue.textContent = `${Math.round(e.target.value * 100)}%`;
        });
        el.captureScreenshot.addEventListener('click', () => this.app.captureScreenshot());

        el.qualityMode.addEventListener('change', e => this.visualizationEngine.setQualityMode(e.target.value));
        el.resetProperties.addEventListener('click', () => this.app.resetProperties());
        el.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // fechar a janela de erro
        el.errorModal.querySelector('.close').addEventListener('click', () => this.hideError());
        el.errorModal.addEventListener('click', e => { if (e.target === el.errorModal) this.hideError(); });

        // Arrastar e largar ficheiros no canvas
        const wrapper = el.canvasWrapper;
        wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.classList.add('dragover'); });
        wrapper.addEventListener('dragleave', () => wrapper.classList.remove('dragover'));
        wrapper.addEventListener('drop', e => {
            e.preventDefault();
            wrapper.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.app.loadAudioFile(e.dataTransfer.files[0]);
        });

        // Atalhos de teclado
        document.addEventListener('keydown', e => this.handleShortcut(e));
    }

    // atalhos de teclado
    handleShortcut(e) {
        const tag = (e.target.tagName || '').toLowerCase();
        // não fazer nada se estiver a escrever num campo
        if (['input', 'select', 'textarea'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === 'Escape') { this.hideError(); return; }

        const types = this.visualizationEngine.getVisualizationTypes();
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= types.length) {
            this.app.setVisualization(types[n - 1].type);
        } else if (e.key === 's' || e.key === 'S') {
            this.app.captureScreenshot();
        } else if (e.key === 'f' || e.key === 'F') {
            this.toggleFullscreen();
        } else if (e.code === 'Space' && this.audioProcessor.isPlaying) {
            e.preventDefault();
            this.app.togglePause();
        }
    }

    // entra ou sai do ecrã inteiro
    toggleFullscreen() {
        const wrapper = this.elements.canvasWrapper;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen().catch(err => this.showError(`Não foi possível entrar em ecrã inteiro: ${err.message}`));
        }
    }

    // Indicadores de nível, tempo e FPS atualizados a partir do loop de animação
    setupAudioLevels() {
        this.visualizationEngine.onFrame = (stats) => {
            const { levelBar, peakMarker, audioLevel, fpsBadge, audioTime, progressBar } = this.elements;
            levelBar.style.width = `${(stats.level * 100).toFixed(1)}%`;
            peakMarker.style.left = `calc(${(stats.peak * 100).toFixed(1)}% - 2px)`;

            // o texto só atualiza de 120 em 120 ms
            const now = performance.now();
            if (now - this.lastInfoUpdate < 120) return;
            this.lastInfoUpdate = now;

            audioLevel.textContent = `Nível: ${Math.round(stats.level * 100)}%`;
            fpsBadge.textContent = `${stats.fps} FPS · ${stats.quality === 'high' ? 'alta' : 'baixa'}`;

            // tempo e barra de progresso
            const ap = this.audioProcessor;
            if (ap.isPlaying && ap.sourceType === 'file' && ap.fileInfo) {
                const current = Math.min(ap.getCurrentTime(), ap.fileInfo.duration);
                audioTime.textContent = `${this.formatTime(current)} / ${this.formatTime(ap.fileInfo.duration)}`;
                progressBar.style.width = `${(current / ap.fileInfo.duration) * 100}%`;
            } else if (ap.isPlaying && ap.sourceType === 'microphone') {
                audioTime.textContent = `Ao vivo · ${this.formatTime(ap.getCurrentTime())}`;
                progressBar.style.width = '100%';
            } else {
                audioTime.textContent = '0:00 / 0:00';
                progressBar.style.width = '0';
            }
        };
    }

    // passa os segundos para m:ss
    formatTime(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
}
