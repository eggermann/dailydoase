const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = process.env.CANK_TRAILER_SOURCE_ROOT
  || path.join(repoRoot, 'GENERATIONS-CANK-TRAILER');
const liveFolder = process.env.CANK_TRAILER_LIVE_FOLDER || 'CANK-TRAILER';
const targetRoot = path.join(repoRoot, 'lib', 'GENERATIONS', liveFolder);
const soundRoot = path.join(targetRoot, 'Sound');
const manifestPath = path.join(targetRoot, 'published-trailers.json');

const videoExtensions = new Set(['.mp4', '.mov', '.webm']);
const audioExtensions = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);

const getFileTime = (filePath) => {
  const stat = fs.statSync(filePath);
  return Math.max(stat.birthtimeMs || 0, stat.mtimeMs || 0);
};

const listFiles = (dirPath) => fs.existsSync(dirPath)
  ? fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
  : [];

const selectFinalVideo = (mergedDir) => {
  const videos = listFiles(mergedDir)
    .filter((filePath) => videoExtensions.has(path.extname(filePath).toLowerCase()))
    .filter((filePath) => !path.basename(filePath).toLowerCase().includes('end-card'));
  const withSound = videos.filter((filePath) => /with-sound\.(mp4|mov|webm)$/i.test(filePath));
  return withSound.sort((left, right) => getFileTime(right) - getFileTime(left))[0] || null;
};

const selectFinalAudio = (generationDir) => listFiles(generationDir)
  .filter((filePath) => audioExtensions.has(path.extname(filePath).toLowerCase()))
  .filter((filePath) => !path.basename(filePath).toLowerCase().includes('chunk-'))
  .sort((left, right) => getFileTime(right) - getFileTime(left))[0] || null;

const slug = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const clearLiveFolder = () => {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(soundRoot, { recursive: true });
};

const collectTrailers = () => {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Trailer source root missing: ${sourceRoot}`);
  }

  return fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const generationDir = path.join(sourceRoot, entry.name);
      const videoPath = selectFinalVideo(path.join(generationDir, 'merged'));
      if (!videoPath) return null;
      return {
        generationDir,
        generationName: entry.name,
        videoPath,
        audioPath: selectFinalAudio(generationDir),
        createdAt: getFileTime(videoPath),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.createdAt - left.createdAt);
};

const main = () => {
  const trailers = collectTrailers();
  if (trailers.length === 0) {
    console.log('No sound-ready trailers to publish yet; keeping the live folder unchanged.');
    return;
  }
  clearLiveFolder();

  const manifest = trailers.map((trailer, index) => {
    const prefix = index + 1;
    const base = `${prefix}-${slug(trailer.generationName)}-${slug(path.basename(trailer.videoPath))}`;
    const videoTarget = path.join(targetRoot, base);
    fs.copyFileSync(trailer.videoPath, videoTarget);
    const sourceVideoMetadata = `${trailer.videoPath}.json`;
    if (fs.existsSync(sourceVideoMetadata)) {
      fs.copyFileSync(sourceVideoMetadata, `${videoTarget}.json`);
    }

    let audioTarget = null;
    if (trailer.audioPath) {
      audioTarget = path.join(soundRoot, `${prefix}-${slug(trailer.generationName)}-${slug(path.basename(trailer.audioPath))}`);
      fs.copyFileSync(trailer.audioPath, audioTarget);
    }

    return {
      sortIndex: prefix,
      generation: trailer.generationName,
      video: path.relative(repoRoot, videoTarget).split(path.sep).join('/'),
      sound: audioTarget ? path.relative(repoRoot, audioTarget).split(path.sep).join('/') : null,
      publishedAt: new Date().toISOString(),
    };
  });

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`published trailers: ${manifest.length}`);
  console.log(`live folder: ${targetRoot}`);
  console.log(`sound folder: ${soundRoot}`);
};

main();
