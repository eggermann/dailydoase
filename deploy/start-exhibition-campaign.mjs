import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaVolume = '/Volumes/DAILYDOASE_MEDIA';
const outputDirectory = join(
  mediaVolume,
  'dailydoase-generations/eu-reski/GENERATIONS/news/exhibition/mac-mini/scene-campaign-10h',
);
const scenePath = 'eu-reski-news/scenes/campaign-10h';
const environmentFile = '/Users/dominikeggermann/Projekte/dailydoase/.env';
const nodeDirectory = dirname(process.execPath);

process.chdir(repositoryRoot);
process.env.PATH = [nodeDirectory, '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  .join(':');
process.env.CAMPAIGN_CONTINUOUS = '1';
process.env.NEWS_PROFILE = 'EU-RESKI exhibition mix';
process.env.NEWS_ENV_FILE = environmentFile;
process.env.NEWS_SCENE_PATH = scenePath;
process.env.NEWS_OUTPUT_DIR = outputDirectory;
process.env.NEWS_REFRESH_INTERVAL_MS = '86400000';
process.env.NEWS_CAMPAIGN_START_SPACING_MS = '515000';
process.env.MAGICK_BIN = '/Applications/MAMP/Library/bin/convert';
process.env.FC_MATCH_BIN = join(repositoryRoot, 'deploy/mini-font-match.sh');
process.env.FFMPEG_BIN = '/usr/local/bin/ffmpeg';
process.env.EXHIBITION_CODEX_REPAIR ||= '1';
process.env.EXHIBITION_COOPERATIVE_RESTART ||= '1';
process.env.NEWS_STYLE_REFERENCE ||= '/Users/dominikeggermann/Projekte/EU-RESKI/guernica-by-pablo-picasso.jpg!Large.jpg';
process.env.GUERNICA_DIRECTORY ||= '/Users/dominikeggermann/Projekte/EU-RESKI/guernica_elemente_maskiert';

async function waitForMediaVolume() {
  while (true) {
    const mountedVolumes = execFileSync('/sbin/mount', [], { encoding: 'utf8' });
    if (mountedVolumes.includes(` on ${mediaVolume} `)) {
      try {
        await mkdir(outputDirectory, { recursive: true });
        return;
      } catch (error) {
        console.error(`Campaign output is not ready yet: ${error.message}`);
      }
    } else {
      console.error(`Waiting for media volume ${mediaVolume} before resuming the campaign.`);
    }

    await delay(30_000);
  }
}

await waitForMediaVolume();

const exhibitionRunner = join(repositoryRoot, 'eu-reski-news/scripts/exhibition-runner.mjs');
process.argv = [process.execPath, exhibitionRunner, `--scene=${scenePath}`];

console.log(`Starting the saved exhibition campaign from ${outputDirectory}.`);
await import(pathToFileURL(exhibitionRunner).href);
