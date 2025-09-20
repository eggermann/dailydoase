/**
 * Concatenate and upload helpers for YouTube.
 *
 * Exports:
 *  - concatVideos({ videoDir, pattern, output }) → outputPath
 *  - uploadToYouTube({ filePath, title, oauthPath, tokensPath, privacy, description, notify }) → { videoId, url }
 *  - concatAndUpload({ videoDir, title }) → wrapper calling both
 *  - isTotalDurationGreater({ videoDir, pattern, maxDuration }) → boolean
 *  - checkAndLogDuration({ imageDir, options }) → boolean (logs and returns whether duration exceeds)
 *
 * If executed directly (node concat-and-upload.js [dir] "Title") it still works as a CLI.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import http from 'http';
import fg from 'fast-glob';
import { createRequire } from 'module';

// Keep CommonJS require access for googleapis (and any other CJS packages)
const require = createRequire(import.meta.url);

// 'open' is ESM-only
const open = (...args) => import('open').then(m => m.default(...args));

// Lazy-load googleapis (so requiring this module without using upload won't immediately fail
// if dependency is missing).
const { google } = require('googleapis');

const DEFAULT_OUTPUT = 'combined.mp4';

/**
 * Main worker.
 */
export async function concatVideos({
    videoDir = '.',
    pattern = '*.{mp4,mkv,mov}',
    output = DEFAULT_OUTPUT,
    listPath
} = {}) {
    // 1) Discover input files
    const files = (await fg([pattern], { cwd: videoDir })).sort();
    if (!files.length) throw new Error('No videos found in ' + videoDir);

    // 2) Build FFmpeg concat list
    const tmpList = listPath || path.join(videoDir, 'list.txt');
    const listFile = files
        .map(f => `file '${path.join(videoDir, f).replace(/'/g, "'\\''")}'`)
        .join('\n');
    fs.writeFileSync(tmpList, listFile);

    // 3) Concatenate
    console.log('[concat-and-upload] Concatenating', files.length, 'clips…');
    execFileSync(
        'ffmpeg',
        ['-y', '-f', 'concat', '-safe', '0', '-i', tmpList, '-c', 'copy', output],
        { stdio: 'inherit' }
    );

    const outputPath = path.resolve(output);
    return outputPath;
}

/**
 * Returns true if the sum of durations of all matching videos exceeds maxDuration (in seconds).
 * Uses the same discovery pattern as concatVideos (fast-glob with cwd=videoDir, sorted).
 */
export async function isTotalDurationGreater({
    videoDir = '.',
    pattern = '*.{mp4,mkv,mov}',
    maxDuration = 90
} = {}) {
    if (maxDuration == null) throw new Error('isTotalDurationGreater: maxDuration is required');
    const limit = Number(maxDuration);
    if (!(limit > 0)) throw new Error('isTotalDurationGreater: maxDuration must be > 0');

    const files = (await fg([pattern], { cwd: videoDir })).sort();
    if (!files.length) return false;

    let total = 0;
    for (const f of files) {
        const abs = path.join(videoDir, f);
        try {
            // execFileSync returns "12.345678\n"
            const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', abs], { encoding: 'utf8' });
            // parseFloat -> 12.345678 (seconds)
            const seconds = parseFloat(out.trim());
            console.log('duration of', f, 'is', seconds);
            console.log('total so far:', total + seconds, 'limit:', limit);
            total += seconds;
        } catch {
            // ignore files ffprobe cannot read; continue summing others
        }

        if (total > limit) return true;
    }
    return total > limit;
}

/**
 * Small helper that mirrors the inline snippet:
 * - Extracts maxDuration from various option shapes
 * - Uses same discovery pattern as concatVideos via isTotalDurationGreater
 * - Logs the result and returns a boolean
 */
export async function checkAndLogDuration({ imageDir, options } = {}) {
    try {
        const maxDuration = options.maxDuration;

        if (maxDuration > 0) {
            const partsDir = path.join(imageDir);
            const exceeds = await isTotalDurationGreater({ videoDir: partsDir, maxDuration });
            console.log('[yt-upload] duration > maxDuration?', exceeds, '(limit:', maxDuration, 'dir:', partsDir + ')');
            return exceeds;
        }

        return false;
    } catch (e2) {
        console.warn('[yt-upload] duration check failed:', e2?.message || e2);
        return false;
    }
}

export async function uploadToYouTube({
    filePath,
    title = 'Auto-uploaded clip',
    oauthPath = 'oauth2.json',
    tokensPath = 'tokens.json',
    privacy = 'public',
    description = 'Uploaded via automated script',
    notify
} = {}) {
    if (!filePath) throw new Error('uploadToYouTube: filePath is required');

    // OAuth2 – load credentials
    const oauthJson = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
    const oauth2Client = new google.auth.OAuth2(
        oauthJson.installed.client_id,
        oauthJson.installed.client_secret,
        oauthJson.installed.redirect_uris[0]
    );

    // Helper to run local OAuth flow and persist fresh tokens
    async function runLocalOAuthFlow() {
        const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
        const code = await new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                const qs = new URL(req.url, 'http://localhost').searchParams;
                const authCode = qs.get('code');
                if (authCode) {
                    res.end('✅ Authorisation received — you can close this tab.');
                    server.close();
                    resolve(authCode);
                } else {
                    res.end('No OAuth code, please try again.');
                }
            });

            server.listen(0, async () => {
                const redirect = `http://localhost:${server.address().port}`;
                oauth2Client.redirectUri = redirect;
                const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    redirect_uri: redirect,
                    prompt: 'consent'
                });
                console.log('Opening browser for OAuth consent…');
                await open(authUrl);
            });
        });

        const { tokens: fresh } = await oauth2Client.getToken({
            code,
            redirect_uri: oauth2Client.redirectUri
        });
        oauth2Client.setCredentials(fresh);
        fs.writeFileSync(tokensPath, JSON.stringify(fresh));
        console.log('✔ Tokens saved to', tokensPath);
    }

    // Re-use or obtain tokens
    if (fs.existsSync(tokensPath)) {
        const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        oauth2Client.setCredentials(tokens);
        console.log('✔ Re-using saved OAuth tokens');
    } else {
        await runLocalOAuthFlow();
    }

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });


    console.log('[concat-and-upload] Uploading', filePath, 'to YouTube as', title, '…');

    const { size: totalBytes } = fs.statSync(filePath);

    // Simple MIME detection from filename
    const ext = (path.extname(filePath) || '').toLowerCase();
    const mimeType = (
        ext === '.mp4' ? 'video/mp4' :
        ext === '.mov' ? 'video/quicktime' :
        ext === '.mkv' ? 'video/x-matroska' :
        ext === '.webm' ? 'video/webm' :
        ext === '.avi' ? 'video/x-msvideo' :
        ext === '.m4v' ? 'video/x-m4v' :
        undefined
    );

    // Retry with exponential backoff for transient errors
    const maxRetries = 5;
    let attempt = 0;
    let authRefreshed = false;
    while (true) {
        let uploadedBytes = 0;
        let lastLoggedPercent = 0;
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('data', (chunk) => {
            uploadedBytes += chunk.length;
            const percent = Math.floor((uploadedBytes / totalBytes) * 100);
            if (percent >= lastLoggedPercent + 5 || percent === 100) {
                lastLoggedPercent = percent;
                console.log(`[concat-and-upload] Upload progress: ${percent}% (${uploadedBytes}/${totalBytes} bytes)`);
            }
        });
        fileStream.on('error', (err) => {
            console.error('[concat-and-upload] File stream error:', err.message || err);
        });

        try {
            const res = await youtube.videos.insert({
                part: 'snippet,status',
                notifySubscribers: (notify ?? (privacy === 'public')),
                requestBody: {
                    snippet: { title, description, categoryId: '24' },
                    status: { privacyStatus: privacy }
                },
                media: { body: fileStream, ...(mimeType ? { mimeType } : {}) },
                uploadType: 'resumable'
            });

            console.log('[concat-and-upload] Upload finished. HTTP status:', res.status ?? 'unknown');
            try {
                console.log('[concat-and-upload] Response data:', JSON.stringify(res.data));
            } catch (e) {
                console.log('[concat-and-upload] Response data (inspect failed):', res.data);
            }

            const videoId = res.data.id;
            const url = `https://youtu.be/${videoId}`;
            console.log('[concat-and-upload] Video URL:', url);
            return { videoId, url };
        } catch (err) {
            const status = err?.response?.status;
            const body = err?.response?.data;
            const errDesc = body?.error || body?.error_description || err?.message || String(err);
            console.error('[concat-and-upload] Upload failed:', errDesc);
            // Handle invalid_grant / unauthorized by refreshing tokens once
            if ((status === 400 && (body?.error === 'invalid_grant' || /invalid_grant/i.test(errDesc))) || status === 401) {
                if (!authRefreshed) {
                    authRefreshed = true;
                    console.warn('[concat-and-upload] Auth appears invalid (invalid_grant/401). Refreshing tokens and retrying…');
                    try { fs.unlinkSync(tokensPath); } catch {}
                    await runLocalOAuthFlow();
                    continue;
                }
            }

            // Check for retryable errors
            const reason = body?.error?.errors?.[0]?.reason || body?.error?.status;
            const retryableStatus = [408, 429, 500, 502, 503, 504];
            const retryableReasons = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError']);
            const isRetryable = retryableStatus.includes(status) || (reason && retryableReasons.has(String(reason)));
            if (isRetryable && attempt < maxRetries) {
                const delay = Math.min(30_000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
                attempt++;
                console.warn(`[concat-and-upload] Transient error (status ${status || 'n/a'}). Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})…`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            if (status) console.error('[concat-and-upload] HTTP status:', status);
            if (body) {
                try {
                    console.error('[concat-and-upload] Response body:', JSON.stringify(body));
                } catch {
                    console.error('[concat-and-upload] Response body (raw):', body);
                }
            } else {
                console.error('[concat-and-upload] No HTTP response available. Stack:', err.stack);
            }
            throw err;
        } finally {
            try { fileStream.destroy(); } catch {}
        }
    }
}

export async function concatAndUpload({ videoDir = '.', title = 'Auto-uploaded clip' } = {}) {
    const outputPath = await concatVideos({ videoDir });
    const { videoId, url } = await uploadToYouTube({ filePath: outputPath, title });
    return { outputPath, videoId, url };
}

// Default export for convenience
export default concatAndUpload;

// CLI compatibility ----------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('concat-and-upload.js')) {
    const videoDir = process.argv[2] ?? '.';
    const title = process.argv[3] ?? 'Auto-uploaded clip';
    concatAndUpload({ videoDir, title })
        .then(({ outputPath, url }) => {
            console.log('[concat-and-upload] Done. File:', outputPath);
            console.log('[concat-and-upload] URL:', url);
        })
        .catch(err => {
            console.error('[concat-and-upload] Error:', err);
            process.exitCode = 1;
        });
}
