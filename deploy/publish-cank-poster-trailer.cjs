// Publish the selected CANK poster trailer only. This intentionally avoids the
// large repository-wide deploy because it adds one self-contained live folder.
const fs = require('fs');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const { loadSshConfig } = require('./ssh-config.cjs');

const repoRoot = path.resolve(__dirname, '..');
const liveFolder = process.env.CANK_POSTER_LIVE_FOLDER || 'CANK-TRAILER-2-POSTER';
const localFolder = path.join(repoRoot, 'lib', 'GENERATIONS', liveFolder);
const remoteFolder = `/home/eggman/Projekte/dailyDoase/lib/GENERATIONS/${liveFolder}`;
const allowed = new Set(['.mp4', '.json']);

const files = fs.readdirSync(localFolder, { withFileTypes: true })
  .filter((entry) => entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => ({
    local: path.join(localFolder, entry.name),
    remote: `${remoteFolder}/${entry.name}`,
  }));

if (!files.some((file) => file.local.endsWith('.mp4'))) {
  throw new Error(`No MP4 available in ${localFolder}`);
}

const ssh = new NodeSSH();
(async () => {
  await ssh.connect(loadSshConfig());
  const directory = await ssh.execCommand(`mkdir -p '${remoteFolder}'`);
  if (directory.code !== 0) throw new Error(directory.stderr || 'Could not create live folder.');
  await ssh.putFiles(files);
  const listing = await ssh.execCommand(`find '${remoteFolder}' -maxdepth 1 -type f -name '*.mp4' -printf '%f\\n'`);
  if (listing.code !== 0 || !listing.stdout.trim()) throw new Error(listing.stderr || 'Remote MP4 verification failed.');
  console.log(`published ${files.length} file(s) to ${remoteFolder}`);
  console.log(listing.stdout.trim());
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => ssh.dispose());
