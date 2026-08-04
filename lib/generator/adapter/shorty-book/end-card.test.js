import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import {
  readExhibitionEndCardData,
  renderExhibitionEndCard,
} from './end-card.js';

const dossierPath = path.resolve('lib/Plak-2_images/formen_der_abweichunf_datas.json');

test('reads exact exhibition credits from the dossier', async () => {
  const data = await readExhibitionEndCardData(dossierPath);

  expect(data.title).toBe('Formen der Abweichung');
  expect(data.vernissageDate).toBe('05.09.2026');
  expect(data.exhibitionRange).toBe('06.09.2026–12.09.2026');
  expect(data.venueName).toBe('CANK Neukölln');
  expect(data.artists).toHaveLength(22);
  expect(data.artists).toContain('Dominik Eggermann');
});

test('renders a readable 4:3 PNG end card', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dailydoase-end-card-'));
  const outputPath = path.join(outputDir, 'end-card.png');

  const result = await renderExhibitionEndCard({ dossierPath, outputPath });
  const metadata = await sharp(result.path).metadata();

  expect(metadata.width).toBe(1184);
  expect(metadata.height).toBe(880);
  expect(metadata.format).toBe('png');
});

test('renders credits over the final scene frame when a background is supplied', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dailydoase-end-card-overlay-'));
  const backgroundImagePath = path.join(outputDir, 'last-scene.png');
  const outputPath = path.join(outputDir, 'end-card-overlay.png');
  await sharp({
    create: {
      width: 1184,
      height: 880,
      channels: 3,
      background: '#42624e',
    },
  }).png().toFile(backgroundImagePath);

  const result = await renderExhibitionEndCard({
    dossierPath,
    outputPath,
    backgroundImagePath,
  });
  const metadata = await sharp(result.path).metadata();

  expect(result.backgroundImagePath).toBe(backgroundImagePath);
  expect(metadata.width).toBe(1184);
  expect(metadata.height).toBe(880);
});
