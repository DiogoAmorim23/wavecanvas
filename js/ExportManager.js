// Exportação de imagens PNG e JPEG e galeria de screenshots
class ExportManager {
    constructor(visualizationEngine) {
        this.visualizationEngine = visualizationEngine;
        this.screenshots = [];       // lista de screenshots tiradas
        this.maxScreenshots = 8;
        // quantas vezes tenta outra vez se falhar
        this.maxRetries = 1;
    }

    // exporta como PNG
    exportAsPNG() {
        return this.exportFrame('image/png');
    }

    // exporta como JPEG com a qualidade escolhida
    exportAsJPEG(quality = 0.9) {
        return this.exportFrame('image/jpeg', quality);
    }

    // tira a imagem e faz download, se falhar tenta mais uma vez
    async exportFrame(mimeType = 'image/png', quality) {
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const shot = await this.captureScreenshot(mimeType, quality);
                this.download(shot.url, shot.filename);
                return shot;
            } catch (error) {
                lastError = error;
                console.warn(`Exportação falhou (tentativa ${attempt + 1}):`, error);
            }
        }
        throw new Error(`Não foi possível exportar a imagem: ${lastError ? lastError.message : 'erro desconhecido'}`);
    }

    // tira uma imagem do canvas e guarda na galeria
    async captureScreenshot(mimeType = 'image/png', quality) {
        const canvas = this.visualizationEngine.canvas;
        const blob = await this.canvasToBlob(canvas, mimeType, quality);
        const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const type = this.visualizationEngine.currentType || 'visualizacao';

        const shot = {
            id: Date.now() + Math.random(),
            blob,
            url: URL.createObjectURL(blob),
            filename: `wavecanvas-${type}-${this.timestamp()}.${extension}`,
            timestamp: new Date(),
            visualization: type
        };

        this.screenshots.unshift(shot);
        // se houver demasiadas apaga as mais antigas
        while (this.screenshots.length > this.maxScreenshots) {
            const removed = this.screenshots.pop();
            URL.revokeObjectURL(removed.url);
        }
        return shot;
    }

    // converte o canvas numa imagem (Blob)
    canvasToBlob(canvas, mimeType, quality) {
        return new Promise((resolve, reject) => {
            if (canvas.toBlob) {
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('O canvas devolveu uma imagem vazia.'));
                }, mimeType, quality);
            } else {
                // para browsers antigos
                const dataUrl = canvas.toDataURL(mimeType, quality);
                fetch(dataUrl).then(r => r.blob()).then(resolve, reject);
            }
        });
    }

    // cria um link escondido e clica nele para descarregar
    download(url, filename) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    // descarrega uma screenshot da galeria
    downloadScreenshot(id) {
        const shot = this.screenshots.find(s => s.id === id);
        if (shot) this.download(shot.url, shot.filename);
    }

    // remove uma screenshot da galeria
    removeScreenshot(id) {
        const index = this.screenshots.findIndex(s => s.id === id);
        if (index === -1) return;
        URL.revokeObjectURL(this.screenshots[index].url);
        this.screenshots.splice(index, 1);
    }

    // data e hora para o nome do ficheiro
    timestamp() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }
}
