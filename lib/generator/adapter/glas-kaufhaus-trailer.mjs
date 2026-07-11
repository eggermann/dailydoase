import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const adapterDir = path.dirname(__filename);
const projectRoot = path.resolve(adapterDir, '../../..');
const posterDir = path.join(projectRoot, 'lib', 'Plak-2_images');
const generationRoot = path.join(projectRoot, 'GENRATIONS-KAUFHAUF');
const presetPath = path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-trailer.sh');
const outputPrefix = 'glas-kaufhaus-shorty-book-trailer-loop-001';

const posterPages = ['page-1.jpg', 'page-2.jpg', 'page-3.jpg', 'page-4.jpg'];
const generatedContextImages = [
  '6d94760a76c3487b7bce9785970ff6667b85b1f7bda92c353a50208fa8a1d977.jpg',
  'eeb16152e5466cde8620748ad03c2cc7ae76fec74d0ae4726097f49743436ef7.jpg',
  'ffde3672901a44523063b9e1811b12c21a9d7735984e6db9d06b99ab94113606.jpg',
];
const words = [
  ['1983', 'de'],
  ['Kaufhaus', 'de'],
  ['Kunstausstellung', 'de'],
];

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));

const assertInputs = async (files) => {
  for (const file of files) {
    const filePath = path.join(posterDir, file);
    await fs.access(filePath);
  }
};

const findNewestRun = async (folderPrefix) => {
  const candidates = [];
  let entries = [];
  try {
    entries = await fs.readdir(generationRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.includes(folderPrefix)) continue;
    const fullPath = path.join(generationRoot, entry.name);
    const stat = await fs.stat(fullPath);
    candidates.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.fullPath || null;
};

const main = async () => {
  const metadataPath = path.join(posterDir, 'formen_der_abweichunf_datas.json');
  const metadata = await readJson(metadataPath);
  await assertInputs([
    ...posterPages,
    ...generatedContextImages,
    'formen_der_abweichunf_datas.json',
  ]);

  const manifest = {
    project: 'glas-kaufhaus-shorty-book-trailer',
    loop: 1,
    sourceMode: 'saved-poster-images-no-live-camera',
    words,
    primaryProtagonistReference: path.join(posterDir, generatedContextImages[0]),
    posterPages: posterPages.map((file) => path.join(posterDir, file)),
    contextImages: generatedContextImages.map((file) => path.join(posterDir, file)),
    exhibitionMetadataFile: metadataPath,
    exhibition: metadata,
    scenes: [
      '1983: the Green Monster wakes the old Kaufhaus warehouse',
      'Kaufhaus / Ware Haus: the monster handles the room memory and its objects',
      'Fernsehen / Kunstausstellung: the warehouse becomes a living 1989 broadcast exhibition',
    ],
    outputFolderPrefix: outputPrefix,
  };

  const configuredFolder = process.env.FRESHWEB_FOLDER || outputPrefix;
  const env = {
    ...process.env,
    FRESHWEB_FOLDER: configuredFolder,
    FRESHWEB_CAMERA_IMAGE_PATH: manifest.primaryProtagonistReference,
    FRESHWEB_WORDS: words.map(([word, language]) => `${word},${language}`).join(' | '),
  };

  console.log('[glas-kaufhaus] source manifest:');
  console.log(JSON.stringify({
    primaryProtagonistReference: manifest.primaryProtagonistReference,
    posterPages: manifest.posterPages.length,
    contextImages: manifest.contextImages.length,
    scenes: manifest.scenes.length,
    words: manifest.words,
  }, null, 2));

  const result = spawnSync('sh', [presetPath], {
    cwd: adapterDir,
    env,
    stdio: 'inherit',
  });

  const runDir = await findNewestRun(configuredFolder);
  if (runDir) {
    await fs.writeFile(
      path.join(runDir, 'glas-kaufhaus-input-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );
    console.log(`[glas-kaufhaus] manifest saved: ${path.join(runDir, 'glas-kaufhaus-input-manifest.json')}`);
  } else {
    await fs.mkdir(generationRoot, { recursive: true });
    const manifestPath = path.join(generationRoot, `${configuredFolder}-input-manifest.json`);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`[glas-kaufhaus] manifest saved: ${manifestPath}`);
  }

  if (result.error) throw result.error;
  process.exit(result.status ?? 0);
};

main().catch((error) => {
  console.error(`[glas-kaufhaus] failed: ${error?.stack || error}`);
  process.exit(1);
});
