const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = process.env.CANK_TRAILER_SOURCE_ROOT
  || path.join(repoRoot, 'GENERATIONS-CANK-TRAILER');
const liveFolder = process.env.CANK_TRAILER_LIVE_FOLDER || 'CANK-TRAILER';
const generationMatch = String(process.env.CANK_TRAILER_GENERATION_MATCH || '').trim();
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

const selectFinalVideos = (mergedDir) => {
  const videos = listFiles(mergedDir)
    .filter((filePath) => videoExtensions.has(path.extname(filePath).toLowerCase()))
    .filter((filePath) => !path.basename(filePath).toLowerCase().includes('end-card'));
  return videos
    .filter((filePath) => /with-sound\.(mp4|mov|webm)$/i.test(filePath))
    .sort((left, right) => getFileTime(right) - getFileTime(left));
};

const selectFinalAudio = (generationDir) => listFiles(generationDir)
  .filter((filePath) => audioExtensions.has(path.extname(filePath).toLowerCase()))
  .filter((filePath) => !path.basename(filePath).toLowerCase().includes('chunk-'))
  .sort((left, right) => getFileTime(right) - getFileTime(left))[0] || null;

const slug = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const ensureLiveFolder = () => {
  fs.mkdirSync(soundRoot, { recursive: true });
};

const findExistingPublishedFile = (dirPath, suffix) => listFiles(dirPath)
  .find((filePath) => path.basename(filePath).endsWith(suffix)) || null;

const readManifest = () => {
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
};

const collectTrailers = () => {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Trailer source root missing: ${sourceRoot}`);
  }

  return fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !generationMatch || entry.name.includes(generationMatch))
    .flatMap((entry) => {
      const generationDir = path.join(sourceRoot, entry.name);
      const videoPaths = selectFinalVideos(path.join(generationDir, 'merged'));
      return videoPaths.map((videoPath) => ({
        generationDir,
        generationName: entry.name,
        videoPath,
        audioPath: selectFinalAudio(generationDir),
        createdAt: getFileTime(videoPath),
      }));
    })
    .sort((left, right) => right.createdAt - left.createdAt);
};

const main = () => {
  const trailers = collectTrailers();
  if (trailers.length === 0) {
    console.log('No sound-ready trailers to publish yet; keeping the live folder unchanged.');
    return;
  }
  ensureLiveFolder();
  const existingManifest = readManifest();
  const manifestByVideo = new Map(existingManifest.map((entry) => [entry.video, entry]));

  for (const trailer of trailers) {
    // New items use `1-` so the live list places their newer file time first.
    // Existing items retain their exact path; this publisher only adds media.
    const prefix = 1;
    const videoSuffix = `-${slug(trailer.generationName)}-${slug(path.basename(trailer.videoPath))}`;
    const videoTarget = findExistingPublishedFile(targetRoot, videoSuffix)
      || path.join(targetRoot, `${prefix}${videoSuffix}`);
    if (!fs.existsSync(videoTarget)) {
      fs.copyFileSync(trailer.videoPath, videoTarget);
    }
    const sourceVideoMetadata = `${trailer.videoPath}.json`;
    if (fs.existsSync(sourceVideoMetadata) && !fs.existsSync(`${videoTarget}.json`)) {
      fs.copyFileSync(sourceVideoMetadata, `${videoTarget}.json`);
    }

    let audioTarget = null;
    if (trailer.audioPath) {
      const audioSuffix = `-${slug(trailer.generationName)}-${slug(path.basename(trailer.audioPath))}`;
      audioTarget = findExistingPublishedFile(soundRoot, audioSuffix)
        || path.join(soundRoot, `${prefix}${audioSuffix}`);
      if (!fs.existsSync(audioTarget)) {
        fs.copyFileSync(trailer.audioPath, audioTarget);
      }
    }

    const entry = {
      sortIndex: prefix,
      generation: trailer.generationName,
      video: path.relative(repoRoot, videoTarget).split(path.sep).join('/'),
      sound: audioTarget ? path.relative(repoRoot, audioTarget).split(path.sep).join('/') : null,
      publishedAt: new Date().toISOString(),
    };
    manifestByVideo.set(entry.video, entry);
  }

  const manifest = [...manifestByVideo.values()]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`published trailers: ${trailers.length}; live total: ${manifest.length}`);
  console.log(`live folder: ${targetRoot}`);
  console.log(`sound folder: ${soundRoot}`);
};

main();
