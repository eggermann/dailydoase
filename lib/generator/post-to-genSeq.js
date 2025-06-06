import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import store from '../store.cjs';
import PostTo from './PostTo.js';



/**
 * Generate a coloured “Zuckertütchen” (little sugar‑packet) PNG.
 * The packet colour is driven by `model.color` (defaults to #FF0000).
 */
class ColorizeTest extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'genSeq';
        this.color = modelConfig.model?.color || '#FF00FF';
    }

    async init() {
        await store.initCache(this.imageDir);
        return this;
    }

    wrapText(text, maxLineLength = 32) {
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const word of words) {
            if ((line + word).length > maxLineLength) {
                lines.push(line.trim());
                line = word + ' ';
            } else {
                line += word + ' ';
            }
        }
        if (line) lines.push(line.trim());
        return lines;
    }

    /**
     * @param {string} prompt – optional extra text to identify the run
     * @param {object} [options]
     */
    async prompt(prompt = '', options = {}) {
        await this.checkSignature();
        const totalPrompt = this.addStaticPrompt(prompt, options);
        // genSeq variant: intentionally leave the packet text empty
        const svgText = '';

        const svg = `\
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320" viewBox="0 0 512 320">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fdfdfd"/>
      <stop offset="100%" stop-color="#e8e8e8"/>
    </linearGradient>
    <linearGradient id="colorOverlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${this.color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${this.color}" stop-opacity="0.4"/>
    </linearGradient>
    <filter id="insetShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feOffset dx="0" dy="1"/>
      <feGaussianBlur stdDeviation="2" result="offset-blur"/>
      <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
      <feFlood flood-color="black" flood-opacity="0.3" result="color"/>
      <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
      <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
    </filter>
  </defs>

  <!-- Base packet shape -->
  <rect x="16" y="16" width="480" height="288" rx="16" fill="url(#paper)" stroke="#ccc" stroke-width="1.5" filter="url(#insetShadow)"/>
  
  <!-- Color overlay -->
  <rect x="16" y="16" width="480" height="288" rx="16" fill="url(#colorOverlay)" opacity="1"/>

  <!-- Decorative lines like a seal -->
  <path d="M16 40 h480" stroke="#bbb" stroke-width="0.5"/>
  <path d="M16 280 h480" stroke="#bbb" stroke-width="0.5"/>

  <!-- Text block -->
  <text x="50%" y="140" text-anchor="middle"
        font-family="Helvetica, sans-serif" font-size="20" font-weight="600"
        fill="#222222" opacity="0.95">
    ${svgText}
  </text>
</svg>`;

        try {
            const colorName = this.color.replace('#', '');
            const imageName = `${Date.now()}-${colorName}.png`;
            const imgPath = path.join(this.imageDir, imageName);
            const jsonPath = path.join(this.imageDir, `${imageName}.json`);

            await sharp(Buffer.from(svg))
                .png()
                .toFile(imgPath);
            store.addFile(path.basename(this.imageDir), imageName);

            const metadata = {
                prompt: totalPrompt,
                color: this.color,
                timestamp: new Date().toISOString()
            };
            await fs.writeJson(jsonPath, metadata, { spaces: 2 });

            console.log(`Test image saved: ${imgPath}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            return true;
        } catch (error) {
            console.error('Error in colorize test:', error);
            return false;
        }
    }
}


export default {
    init: async (config) => {
        const instance = new ColorizeTest(config);
        return await instance.init();
    }
};
