const express = require("express");
const path = require("path");
const { handlebars } = require("./functions.cjs");
const fsPromises = require("fs").promises;
const fs = require("fs");
const bodyParser = require("body-parser");
const cors = require("cors");
const store = require("../store.cjs");
const storeFunction = require("../store-function.cjs");
const _ = require("./functions.cjs");
const { streamMedia } = require("./media-utils.cjs");

const app = express();
const router = express.Router();

const baseUrl = "https://dailydoase.de";
const port = 4000;
const defaultMenuPath = path.join(__dirname, "../../GENERATIONS");
const repoRoot = path.resolve(__dirname, "../..");
const continuousGenerationsRoot = path.join(
    repoRoot,
    "lib/generator/adapter/tests/GENERATIONS"
);

const __ = { dailymotionCnt: 0, youtubeCnt: 0, maxJsonFiles: 20 };

app.use(cors());

const getFileJSON = async (jsonPath) => {
    try {
     //   console.log("getFileJSON", jsonPath);
        const data = fs.readFileSync(jsonPath, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.warn("Error in getFileJSON:", err);
        return {};
    }
};
const getInfoJson = async (img) => {

    if (!img || !img.metadata || !img.metadata.fullPath) {
        console.log("Invalid image object:", img);
        throw new Error("Invalid image object: missing metadata or fullPath");
    }

    const dirname = path.dirname(img.metadata.fullPath);

    const infoPath = path.join(dirname, 'info.json');
    if (fs.existsSync(infoPath)) {
        try {
            const data = await fsPromises.readFile(infoPath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`Error reading info.json in ${dirname}:`, error);
            return {};
        }
    }
    return {};
}

const getContinuousFolderPath = (folder) => {
    if (!folder || typeof folder !== "string") {
        throw new Error("Missing folder query parameter");
    }

    const trimmedFolder = folder.trim();
    const resolvedFolder = path.resolve(repoRoot, trimmedFolder);
    const relativeFolder = path.relative(repoRoot, resolvedFolder);

    if (
        relativeFolder.startsWith("..") ||
        path.isAbsolute(relativeFolder) ||
        !fs.existsSync(resolvedFolder) ||
        !fs.statSync(resolvedFolder).isDirectory()
    ) {
        throw new Error("Folder must be an existing directory inside the repository");
    }

    return {
        absolutePath: resolvedFolder,
        relativePath: relativeFolder.split(path.sep).join("/"),
    };
};

const getNewestContinuousPartsFolder = () => {
    if (!fs.existsSync(continuousGenerationsRoot)) {
        throw new Error("Continuous video generations folder does not exist");
    }

    const getGenerationPrefix = (name) => {
        const match = /^(\d+)-/.exec(name);
        return match ? Number(match[1]) : -1;
    };

    const hasPlayableVideoFile = (partsPath) => {
        try {
            return fs.readdirSync(partsPath, { withFileTypes: true }).some((entry) => (
                entry.isFile() && /\.(mp4|webm|mov)$/i.test(entry.name)
            ));
        } catch (error) {
            return false;
        }
    };

    const generationFolders = fs.readdirSync(continuousGenerationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "archive" && entry.name !== "best")
        .map((entry) => {
            const generationPath = path.join(continuousGenerationsRoot, entry.name);
            const partsPath = path.join(generationPath, "parts");
            if (!fs.existsSync(partsPath) || !fs.statSync(partsPath).isDirectory()) {
                return null;
            }
            return {
                name: entry.name,
                generationPath,
                partsPath,
                prefix: getGenerationPrefix(entry.name),
                mtimeMs: fs.statSync(generationPath).mtimeMs,
                hasPlayableVideoFile: hasPlayableVideoFile(partsPath),
            };
        })
        .filter(Boolean)
        .sort((left, right) => {
            if (left.prefix !== right.prefix) {
                return right.prefix - left.prefix;
            }
            if (left.hasPlayableVideoFile !== right.hasPlayableVideoFile) {
                return Number(right.hasPlayableVideoFile) - Number(left.hasPlayableVideoFile);
            }
            return right.mtimeMs - left.mtimeMs;
        });

    if (generationFolders.length === 0) {
        throw new Error("No generation folder with a parts directory found under lib/generator/adapter/tests/GENERATIONS");
    }

    return path.relative(repoRoot, generationFolders[0].partsPath).split(path.sep).join("/");
};

const getContinuousVideoPrompt = (json) => {
    const promptCandidates = [
        json?.prompt,
        json?.payload?.prompt,
        json?.raw?.prompt,
        json?.input?.prompt,
    ];

    for (const candidate of promptCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    return "";
};

const getContinuousVideoFiles = (folder) => {
    const { absolutePath, relativePath } = getContinuousFolderPath(folder);
    const files = fs.readdirSync(absolutePath, { withFileTypes: true })
        .map((entry) => {
            const entryPath = path.join(absolutePath, entry.name);
            try {
                const stat = fs.statSync(entryPath);
                return stat.isFile() ? entry.name : "";
            } catch (error) {
                return "";
            }
        })
        .filter(Boolean)
        .filter((name) => /\.(mp4|webm|mov)$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
        .map((name, index) => {
            const fileAbsolutePath = path.join(absolutePath, name);
            const jsonAbsolutePath = path.join(
                absolutePath,
                `${path.basename(name, path.extname(name))}.json`
            );
            const stat = fs.statSync(fileAbsolutePath);
            const relativeFilePath = `${relativePath}/${name}`;
            const ext = path.extname(name).toLowerCase();
            let contentType = "video/mp4";
            if (ext === ".webm") contentType = "video/webm";
            if (ext === ".mov") contentType = "video/quicktime";
            let prompt = "";

            if (fs.existsSync(jsonAbsolutePath)) {
                try {
                    const jsonData = JSON.parse(fs.readFileSync(jsonAbsolutePath, "utf8"));
                    prompt = getContinuousVideoPrompt(jsonData);
                } catch (error) {
                    console.warn("Failed to read continuous video prompt JSON:", jsonAbsolutePath, error.message);
                }
            }

            return {
                id: `${stat.mtimeMs}-${index}`,
                name,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                src: `/continuous-video-file/${encodeURI(relativeFilePath)}`,
                contentType,
                prompt,
            };
        });

    return {
        folder: relativePath,
        count: files.length,
        files,
    };
};

const renderContinuousVideoPage = (folder = "", initialError = "") => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Continuous Video Player</title>
    <style>
        :root {
            --bg: #090909;
            --panel: rgba(255, 255, 255, 0.08);
            --text: #f4f1e8;
            --muted: #cbbfa9;
            --accent: #e0ff5b;
            --fade-ms: 420ms;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Trebuchet MS", "Avenir Next", sans-serif;
            background:
                radial-gradient(circle at top, rgba(224, 255, 91, 0.12), transparent 35%),
                linear-gradient(180deg, #17130c 0%, var(--bg) 55%);
            color: var(--text);
        }
        .page {
            width: min(1100px, calc(100vw - 32px));
            margin: 0 auto;
            padding: 24px 0 40px;
        }
        .meta {
            margin-bottom: 16px;
            padding: 16px 18px;
            background: var(--panel);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 18px;
            backdrop-filter: blur(10px);
        }
        .meta h1 {
            margin: 0 0 8px;
            font-size: clamp(1.4rem, 3vw, 2.4rem);
        }
        .meta p, .meta code {
            margin: 0;
            color: var(--muted);
            word-break: break-word;
        }
        .folder-form {
            margin-top: 14px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .folder-form input {
            flex: 1 1 420px;
            min-width: 220px;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(0, 0, 0, 0.28);
            color: var(--text);
            font: inherit;
        }
        .folder-form button {
            padding: 12px 16px;
            border: 0;
            border-radius: 12px;
            background: var(--accent);
            color: #111;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
        }
        .folder-form button:hover {
            filter: brightness(0.95);
        }
        .playback-controls {
            margin-top: 14px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px 18px;
            color: var(--muted);
        }
        .playback-controls label {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .playback-controls select,
        .playback-controls input[type="range"] {
            accent-color: var(--accent);
        }
        .playback-controls select {
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(0, 0, 0, 0.28);
            color: var(--text);
            font: inherit;
        }
        .playback-controls output {
            min-width: 2ch;
            color: var(--accent);
            font-weight: 700;
        }
        .player-shell {
            position: relative;
            aspect-ratio: 16 / 9;
            background: #000;
            border-radius: 22px;
            overflow: hidden;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .player-shell.is-fullscreen-ui-idle {
            cursor: none;
        }
        .player-overlay {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 3;
            padding: 14px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.72) 65%);
            pointer-events: none;
            opacity: 1;
            transition: opacity 220ms ease;
        }
        .player-shell.is-fullscreen-ui-idle .player-overlay {
            opacity: 0;
        }
        .player-overlay__count,
        .player-overlay__button {
            pointer-events: auto;
        }
        .player-shell.is-fullscreen-ui-idle .player-overlay__count,
        .player-shell.is-fullscreen-ui-idle .player-overlay__button {
            pointer-events: none;
        }
        .player-overlay__count {
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.1);
            color: var(--text);
            font-weight: 700;
            letter-spacing: 0.02em;
        }
        .player-overlay__button {
            padding: 8px 12px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.48);
            color: var(--text);
            font: inherit;
            font-weight: 700;
            cursor: pointer;
        }
        .player-overlay__button:hover {
            background: rgba(255, 255, 255, 0.14);
        }
        video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
            opacity: 0;
            transition: opacity var(--fade-ms) linear;
        }
        video.is-active {
            opacity: 1;
        }
        .status {
            margin-top: 14px;
            padding: 14px 18px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px 18px;
            background: rgba(0, 0, 0, 0.28);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
        }
        .status strong {
            color: var(--accent);
        }
        .prompt {
            margin-top: 14px;
            color: var(--muted);
            font-size: 0.95rem;
            line-height: 1.35;
        }
        .prompt strong {
            color: var(--accent);
        }
        .hint {
            margin-top: 14px;
            color: var(--muted);
            font-size: 0.95rem;
        }
        .error {
            margin-top: 12px;
            min-height: 1.4em;
            color: #ff9f8d;
            font-size: 0.95rem;
        }
    </style>
</head>
<body>
    <div class="page">
        <section class="meta">
            <h1>Continuous Folder Video Player</h1>
            <p>Folder: <code>${folder || 'paste a folder path below'}</code></p>
            <form class="folder-form" action="/continuous-video" method="get">
                <input
                    type="text"
                    name="folder"
                    value="${folder}"
                    placeholder="lib/generator/.../parts"
                    spellcheck="false"
                    autocomplete="off"
                >
                <button type="submit">Open Folder</button>
            </form>
            <div class="playback-controls">
                <label>
                    Loop
                    <select id="loop-mode">
                        <option value="all">All clips</option>
                        <option value="tail" selected>Newest tail</option>
                    </select>
                </label>
                <label>
                    <input id="pingpong-mode" type="checkbox">
                    Ping-pong
                </label>
                <label>
                    Tail size
                    <input id="tail-count" type="range" min="2" max="8" step="1" value="8">
                    <output id="tail-count-value">8</output>
                </label>
            </div>
        </section>

        <section class="player-shell">
            <video id="video-a" muted playsinline autoplay preload="auto"></video>
            <video id="video-b" muted playsinline autoplay preload="auto"></video>
            <div class="player-overlay">
                <div class="player-overlay__count" id="video-count">0/0</div>
                <button class="player-overlay__button" id="fullscreen-toggle" type="button">Fullscreen</button>
            </div>
        </section>

        <section class="status">
            <div>Now playing: <strong id="now-playing">waiting for files</strong></div>
            <div>Buffered next: <strong id="next-playing">none</strong></div>
            <div>Folder files: <strong id="file-count">0</strong></div>
        </section>

        <p class="prompt"><strong>Prompt:</strong> <span id="video-prompt">waiting for prompt</span></p>
        <p class="hint">Behavior: the player cycles through all detected clips in filename order. The next clip is preloaded in the hidden video element first, then swapped in at the boundary to avoid a black load gap. New files are picked up automatically.</p>
        <p class="error" id="player-error"></p>
    </div>

    <script>
        (() => {
            const folder = ${JSON.stringify(folder)};
            const initialError = ${JSON.stringify(initialError)};
            const playlistUrl = '/continuous-video-api?folder=' + encodeURIComponent(folder);
            const videos = [
                document.getElementById('video-a'),
                document.getElementById('video-b'),
            ];
            const nowPlayingEl = document.getElementById('now-playing');
            const nextPlayingEl = document.getElementById('next-playing');
            const fileCountEl = document.getElementById('file-count');
            const videoPromptEl = document.getElementById('video-prompt');
            const errorEl = document.getElementById('player-error');
            const loopModeEl = document.getElementById('loop-mode');
            const pingPongModeEl = document.getElementById('pingpong-mode');
            const tailCountEl = document.getElementById('tail-count');
            const tailCountValueEl = document.getElementById('tail-count-value');
            const playerShellEl = document.querySelector('.player-shell');
            const videoCountEl = document.getElementById('video-count');
            const fullscreenToggleEl = document.getElementById('fullscreen-toggle');

            let playlist = [];
            let currentIndex = -1;
            let activeSlot = 0;
            let preloadedIndex = -1;
            let loadingIndex = -1;
            let transitionInFlight = false;
            let loopMode = 'tail';
            let pingPongEnabled = false;
            let pingPongDirection = 1;
            let tailCount = 8;
            let fullscreenOverlayTimer = null;
            let preloadedDirection = 1;
            let latestFolderFileCount = 0;
            let tailRoundsCompleted = 0;
            let playAllRoundActive = false;
            let deactivateAllRoundAfterStep = false;
            let boundaryTransitionInFlight = false;
            let playlistRefreshPromise = null;
            let startPlaybackPromise = null;
            let recoveryInFlight = false;
            let lastPlaybackProgressAtMs = Date.now();
            let lastObservedCurrentTime = 0;
            let transitionStartedAtMs = 0;
            const failedClipIds = new Set();
            const crossfadeMs = 420;
            const handoffWindowSeconds = 0.5;
            const fullscreenOverlayIdleMs = 1600;
            const minimumClipAgeMs = 4000;
            const playAllEveryTailRounds = 10;
            const playlistRefreshIntervalMs = 4000;
            const playbackWatchdogIntervalMs = 2000;
            const playbackStallThresholdMs = 8000;
            const transitionStallThresholdMs = 5000;

            document.documentElement.style.setProperty('--fade-ms', String(crossfadeMs) + 'ms');

            const setError = (message) => {
                errorEl.textContent = message || '';
            };

            const bumpPlaybackHeartbeat = () => {
                lastPlaybackProgressAtMs = Date.now();
            };

            const notePlaybackProgress = (video) => {
                if (!video) {
                    return;
                }
                const nextTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                if (Math.abs(nextTime - lastObservedCurrentTime) > 0.04) {
                    lastObservedCurrentTime = nextTime;
                    bumpPlaybackHeartbeat();
                }
            };

            const setActiveSlot = (slot) => {
                activeSlot = slot;
                videos.forEach((video, index) => {
                    video.classList.toggle('is-active', index === slot);
                    video.style.opacity = index === slot ? '1' : '0';
                });
            };

            const syncTailControls = () => {
                const maxTail = Math.max(2, playlist.length || 2);
                tailCountEl.max = String(maxTail);
                if (tailCount > maxTail) {
                    tailCount = maxTail;
                }
                tailCountEl.value = String(tailCount);
                tailCountValueEl.value = String(tailCount);
                tailCountValueEl.textContent = String(tailCount);
                tailCountEl.disabled = loopMode !== 'tail';
            };

            const getLoopRange = () => {
                if (!playlist.length) {
                    return { start: -1, end: -1 };
                }
                if (loopMode !== 'tail' || playAllRoundActive) {
                    return { start: 0, end: playlist.length - 1 };
                }
                const size = Math.min(Math.max(2, tailCount), playlist.length);
                return {
                    start: Math.max(0, playlist.length - size),
                    end: playlist.length - 1,
                };
            };

            const getPreferredStartIndex = () => {
                const { start, end } = getLoopRange();
                if (start < 0 || end < start) {
                    return -1;
                }
                if (loopMode === 'tail' && !playAllRoundActive) {
                    return end;
                }
                return start;
            };

            const getNextStep = () => {
                if (!playlist.length) {
                    return { index: -1, direction: pingPongDirection };
                }
                const { start, end } = getLoopRange();
                if (start < 0 || end < start) {
                    return { index: -1, direction: pingPongDirection };
                }
                if (currentIndex < start || currentIndex > end) {
                    return { index: getPreferredStartIndex(), direction: 1 };
                }
                if (!pingPongEnabled || start === end) {
                    if (playAllRoundActive) {
                        if (currentIndex >= end) {
                            deactivateAllRoundAfterStep = true;
                            return {
                                index: 0,
                                direction: pingPongDirection,
                            };
                        }
                        return {
                            index: currentIndex + 1,
                            direction: pingPongDirection,
                        };
                    }
                    return {
                        index: (() => {
                            if (currentIndex < end) {
                                return currentIndex + 1;
                            }
                            if (loopMode === 'tail') {
                                tailRoundsCompleted += 1;
                                if (
                                    !pingPongEnabled
                                    && latestFolderFileCount > tailCount
                                    && tailRoundsCompleted % playAllEveryTailRounds === 0
                                ) {
                                    playAllRoundActive = true;
                                    deactivateAllRoundAfterStep = false;
                                    return 0;
                                }
                            }
                            return start;
                        })(),
                        direction: pingPongDirection,
                    };
                }
                if (pingPongDirection >= 0) {
                    if (currentIndex < end) {
                        return { index: currentIndex + 1, direction: 1 };
                    }
                    return { index: end - 1, direction: -1 };
                }
                if (currentIndex > start) {
                    return { index: currentIndex - 1, direction: -1 };
                }
                return {
                    index: start < end ? start + 1 : start,
                    direction: 1,
                };
            };

            const getEligibleFiles = (files) => files.filter((item) => (
                item
                && !failedClipIds.has(item.id)
                && (Date.now() - item.mtimeMs) >= minimumClipAgeMs
            ));

            const removeFailedClipFromPlaylist = (clipId) => {
                if (!clipId) {
                    return;
                }
                playlist = playlist.filter((item) => item.id !== clipId);
                if (playlist.length === 0) {
                    currentIndex = -1;
                    preloadedIndex = -1;
                } else if (currentIndex >= playlist.length) {
                    currentIndex = playlist.length - 1;
                }
                updateStatus();
            };

            const markClipFailed = (index, reason) => {
                const item = playlist[index];
                if (!item) {
                    return false;
                }
                failedClipIds.add(item.id);
                console.warn('Skipping failed clip', item.name, reason || '');
                removeFailedClipFromPlaylist(item.id);
                if (preloadedIndex === index) {
                    preloadedIndex = -1;
                }
                if (loadingIndex === index) {
                    loadingIndex = -1;
                }
                return playlist.length > 0;
            };

            const updateStatus = () => {
                nowPlayingEl.textContent = folder
                    ? (playlist[currentIndex]?.name || 'waiting for files')
                    : 'paste a folder path';
                nextPlayingEl.textContent = playlist[preloadedIndex]?.name || 'none';
                fileCountEl.textContent = String(latestFolderFileCount || playlist.length);
                videoPromptEl.textContent = folder
                    ? (playlist[currentIndex]?.prompt || 'no prompt found for this clip')
                    : 'paste a folder path';
                videoCountEl.textContent = playlist.length > 0 && currentIndex >= 0
                    ? String(currentIndex + 1) + '/' + String(playlist.length)
                    : '0/0';
                syncTailControls();
            };

            const isFullscreenActive = () => (
                document.fullscreenElement === playerShellEl
                || document.webkitFullscreenElement === playerShellEl
            );

            const clearFullscreenOverlayTimer = () => {
                if (fullscreenOverlayTimer) {
                    window.clearTimeout(fullscreenOverlayTimer);
                    fullscreenOverlayTimer = null;
                }
            };

            const showFullscreenOverlay = () => {
                playerShellEl.classList.remove('is-fullscreen-ui-idle');
            };

            const scheduleFullscreenOverlayDim = () => {
                clearFullscreenOverlayTimer();
                if (!isFullscreenActive()) {
                    showFullscreenOverlay();
                    return;
                }
                fullscreenOverlayTimer = window.setTimeout(() => {
                    playerShellEl.classList.add('is-fullscreen-ui-idle');
                }, fullscreenOverlayIdleMs);
            };

            const syncFullscreenButton = () => {
                fullscreenToggleEl.textContent = isFullscreenActive()
                    ? 'Exit Fullscreen'
                    : 'Fullscreen';
                if (isFullscreenActive()) {
                    showFullscreenOverlay();
                    scheduleFullscreenOverlayDim();
                } else {
                    clearFullscreenOverlayTimer();
                    showFullscreenOverlay();
                }
            };

            const toggleFullscreen = async () => {
                try {
                    if (isFullscreenActive()) {
                        if (document.exitFullscreen) {
                            await document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        }
                    } else if (playerShellEl.requestFullscreen) {
                        await playerShellEl.requestFullscreen();
                    } else if (playerShellEl.webkitRequestFullscreen) {
                        playerShellEl.webkitRequestFullscreen();
                    }
                } catch (error) {
                    console.warn('Fullscreen toggle failed', error);
                } finally {
                    syncFullscreenButton();
                }
            };

            const fetchPlaylist = async () => {
                if (playlistRefreshPromise) {
                    return playlistRefreshPromise;
                }
                playlistRefreshPromise = (async () => {
                    if (!folder || !folder.trim()) {
                        playlist = [];
                        latestFolderFileCount = 0;
                        updateStatus();
                        return playlist;
                    }
                    const response = await fetch(playlistUrl, { cache: 'no-store' });
                    if (!response.ok) {
                        throw new Error('Failed to load playlist');
                    }
                    const data = await response.json();
                    latestFolderFileCount = data.count || 0;
                    const nextPlaylist = getEligibleFiles(data.files || []);
                    const currentClipId = playlist[currentIndex]?.id;
                    const preloadedClipId = playlist[preloadedIndex]?.id;
                    playlist = nextPlaylist;
                    currentIndex = currentClipId
                        ? playlist.findIndex((item) => item.id === currentClipId)
                        : currentIndex;
                    preloadedIndex = preloadedClipId
                        ? playlist.findIndex((item) => item.id === preloadedClipId)
                        : preloadedIndex;
                    if (currentIndex < 0 && playlist.length) {
                        currentIndex = getPreferredStartIndex();
                    }
                    if (preloadedIndex < 0) {
                        preloadedIndex = -1;
                    }
                    if (playlist.length) {
                        setError('');
                    } else if (latestFolderFileCount > 0) {
                        setError('Waiting for clips to finish writing before playback starts.');
                    }
                    updateStatus();
                    return playlist;
                })();

                try {
                    return await playlistRefreshPromise;
                } finally {
                    playlistRefreshPromise = null;
                }
            };

            const waitForCanPlay = (video) => new Promise((resolve, reject) => {
                if (video.readyState >= 3) {
                    resolve();
                    return;
                }
                const cleanup = () => {
                    video.removeEventListener('canplay', handleCanPlay);
                    video.removeEventListener('error', handleError);
                };
                const handleCanPlay = () => {
                    cleanup();
                    resolve();
                };
                const handleError = () => {
                    cleanup();
                    reject(new Error('Video failed to preload'));
                };
                video.addEventListener('canplay', handleCanPlay, { once: true });
                video.addEventListener('error', handleError, { once: true });
            });

            const playVideo = async (video) => {
                try {
                    video.muted = true;
                    video.playsInline = true;
                    const playResult = video.play();
                    if (playResult && typeof playResult.then === 'function') {
                        await playResult;
                    }
                    bumpPlaybackHeartbeat();
                    setError('');
                    return true;
                } catch (error) {
                    setError('Autoplay blocked or playback failed. Press play on the video controls.');
                    console.warn('Playback failed', error);
                    return false;
                }
            };

            const completeTransitionToSlot = async (nextSlot) => {
                if (transitionInFlight === false) {
                    return;
                }

                const currentVideo = videos[activeSlot];
                const nextVideo = videos[nextSlot];

                setActiveSlot(nextSlot);
                currentVideo.pause();
                currentVideo.currentTime = 0;
                currentVideo.style.opacity = '0';
                nextVideo.style.opacity = '1';
                pingPongDirection = preloadedDirection;
                currentIndex = preloadedIndex;
                preloadedIndex = -1;
                if (deactivateAllRoundAfterStep && playAllRoundActive && currentIndex === 0) {
                    playAllRoundActive = false;
                    deactivateAllRoundAfterStep = false;
                }
                transitionInFlight = false;
                transitionStartedAtMs = 0;
                bumpPlaybackHeartbeat();
                notePlaybackProgress(nextVideo);
                updateStatus();
                void preloadIndex(getNextStep());
                await playVideo(nextVideo);
            };

            const preloadIndex = async (step) => {
                const index = typeof step === 'number' ? step : step?.index;
                const nextDirection = typeof step === 'object' && step
                    ? step.direction
                    : pingPongDirection;
                if (index < 0 || !playlist[index]) return false;
                if (preloadedIndex === index) return true;
                if (loadingIndex === index) return false;

                const hiddenSlot = activeSlot === 0 ? 1 : 0;
                const hiddenVideo = videos[hiddenSlot];
                const item = playlist[index];

                loadingIndex = index;
                hiddenVideo.pause();
                hiddenVideo.removeAttribute('src');
                hiddenVideo.load();
                hiddenVideo.src = item.src + '?t=' + encodeURIComponent(String(item.mtimeMs));
                hiddenVideo.currentTime = 0;
                hiddenVideo.load();

                try {
                    await waitForCanPlay(hiddenVideo);
                    preloadedIndex = index;
                    preloadedDirection = nextDirection;
                    updateStatus();
                    return true;
                } catch (error) {
                    const hasMore = markClipFailed(index, error.message);
                    if (!hasMore) {
                        setError('No browser-playable clips available yet. Waiting for the next stable file.');
                        return false;
                    }
                    return preloadIndex(getNextStep());
                } finally {
                    loadingIndex = -1;
                }
            };

            const swapToPreloaded = async ({ allowRestartCurrent = false } = {}) => {
                if (transitionInFlight) {
                    return false;
                }

                const currentVideo = videos[activeSlot];
                if (preloadedIndex < 0 || preloadedIndex === currentIndex) {
                    if (allowRestartCurrent) {
                        currentVideo.currentTime = 0;
                        await playVideo(currentVideo);
                    }
                    return false;
                }

                const nextSlot = activeSlot === 0 ? 1 : 0;
                const nextVideo = videos[nextSlot];
                transitionInFlight = true;
                transitionStartedAtMs = Date.now();

                nextVideo.currentTime = 0;
                const started = await playVideo(nextVideo);
                if (!started) {
                    const hasMore = markClipFailed(preloadedIndex, 'Playback failed after preload');
                    transitionInFlight = false;
                    transitionStartedAtMs = 0;
                    if (hasMore) {
                        await preloadIndex(getNextStep());
                    } else {
                        setError('No browser-playable clips available yet. Waiting for the next stable file.');
                    }
                    return false;
                }

                nextVideo.classList.add('is-active');
                nextVideo.style.opacity = '1';
                currentVideo.style.opacity = '0';

                window.setTimeout(() => {
                    void completeTransitionToSlot(nextSlot);
                }, crossfadeMs);
                return true;
            };

            const handleBoundaryTransition = async ({ index, video, allowRestartCurrent = false } = {}) => {
                if (
                    index !== activeSlot
                    || transitionInFlight
                    || boundaryTransitionInFlight
                ) {
                    return;
                }

                boundaryTransitionInFlight = true;
                try {
                    await fetchPlaylist();
                    await preloadIndex(getNextStep());
                    await swapToPreloaded({ allowRestartCurrent });
                } catch (error) {
                    setError('Loop transition failed. Check the folder path or file format.');
                    console.warn('Loop transition failed', error);
                } finally {
                    boundaryTransitionInFlight = false;
                }
            };

            const recoverPlayback = async (reason = '') => {
                if (recoveryInFlight) {
                    return false;
                }

                recoveryInFlight = true;
                console.warn('Recovering continuous playback', reason);
                transitionInFlight = false;
                boundaryTransitionInFlight = false;
                transitionStartedAtMs = 0;

                try {
                    await fetchPlaylist();
                    if (!playlist.length) {
                        setError('No browser-playable clips available yet. Waiting for the next stable file.');
                        window.setTimeout(() => {
                            void startPlayback();
                        }, 1500);
                        return false;
                    }

                    let attempts = 0;
                    while (playlist.length && attempts < Math.max(playlist.length, 1)) {
                        if (currentIndex < 0 || currentIndex >= playlist.length) {
                            currentIndex = getPreferredStartIndex();
                        }
                        const item = playlist[currentIndex];
                        if (!item) {
                            break;
                        }

                        const activeVideo = videos[activeSlot];
                        preloadedIndex = -1;
                        activeVideo.pause();
                        activeVideo.removeAttribute('src');
                        activeVideo.load();
                        activeVideo.src = item.src + '?t=' + encodeURIComponent(String(item.mtimeMs));
                        activeVideo.currentTime = 0;
                        activeVideo.load();
                        setActiveSlot(activeSlot);
                        updateStatus();

                        try {
                            await waitForCanPlay(activeVideo);
                            const started = await playVideo(activeVideo);
                            if (!started) {
                                throw new Error('Recovery playback failed');
                            }
                            notePlaybackProgress(activeVideo);
                            void preloadIndex(getNextStep());
                            return true;
                        } catch (error) {
                            const hasMore = markClipFailed(currentIndex, error.message);
                            if (!hasMore) {
                                break;
                            }
                            currentIndex = getPreferredStartIndex();
                            attempts += 1;
                        }
                    }

                    setError('Playback recovery failed. Waiting for the next stable clip.');
                    return false;
                } finally {
                    recoveryInFlight = false;
                }
            };

            const startPlayback = async () => {
                if (startPlaybackPromise) {
                    return startPlaybackPromise;
                }
                startPlaybackPromise = (async () => {
                    if (initialError) {
                        setError(initialError);
                    }
                    if (!folder || !folder.trim()) {
                        updateStatus();
                        return;
                    }
                    await fetchPlaylist();
                    if (!playlist.length) {
                        window.setTimeout(() => {
                            void startPlayback();
                        }, 1500);
                        return;
                    }

                    pingPongDirection = 1;
                    preloadedDirection = 1;
                    currentIndex = getPreferredStartIndex();
                    lastObservedCurrentTime = 0;
                    lastPlaybackProgressAtMs = Date.now();

                    while (playlist.length && currentIndex >= 0 && currentIndex < playlist.length) {
                        const activeVideo = videos[activeSlot];
                        const item = playlist[currentIndex];

                        activeVideo.pause();
                        activeVideo.removeAttribute('src');
                        activeVideo.load();
                        activeVideo.src = item.src + '?t=' + encodeURIComponent(String(item.mtimeMs));
                        activeVideo.currentTime = 0;
                        activeVideo.load();
                        setActiveSlot(activeSlot);
                        updateStatus();

                        try {
                            await waitForCanPlay(activeVideo);
                            const started = await playVideo(activeVideo);
                            if (!started) {
                                throw new Error('Playback failed');
                            }
                            notePlaybackProgress(activeVideo);
                            void preloadIndex(getNextStep());
                            return;
                        } catch (error) {
                            const hasMore = markClipFailed(currentIndex, error.message);
                            if (!hasMore) {
                                break;
                            }
                            currentIndex = Math.max(0, getLoopRange().start);
                        }
                    }

                    setError('No browser-playable clips available yet. Waiting for the next stable file.');
                    window.setTimeout(() => {
                        void startPlayback();
                    }, 1500);
                })();

                try {
                    return await startPlaybackPromise;
                } finally {
                    startPlaybackPromise = null;
                }
            };

            videos.forEach((video, index) => {
                video.addEventListener('playing', () => {
                    if (index !== activeSlot) {
                        return;
                    }
                    bumpPlaybackHeartbeat();
                    notePlaybackProgress(video);
                });

                video.addEventListener('error', () => {
                    if (index !== activeSlot) {
                        return;
                    }
                    void recoverPlayback('Active video element error');
                });

                video.addEventListener('timeupdate', async () => {
                    if (index !== activeSlot || transitionInFlight || !Number.isFinite(video.duration)) {
                        return;
                    }
                    notePlaybackProgress(video);
                    const remaining = video.duration - video.currentTime;
                    if (remaining > handoffWindowSeconds) {
                        return;
                    }
                    await handleBoundaryTransition({ index, video, allowRestartCurrent: false });
                });

                video.addEventListener('ended', async () => {
                    if (index !== activeSlot) {
                        return;
                    }
                    await handleBoundaryTransition({ index, video, allowRestartCurrent: true });
                });
            });

            const runPlaybackWatchdog = async () => {
                if (!folder || !folder.trim() || recoveryInFlight || startPlaybackPromise) {
                    return;
                }

                if (transitionInFlight) {
                    if ((Date.now() - transitionStartedAtMs) > transitionStallThresholdMs) {
                        await recoverPlayback('Transition timeout');
                    }
                    return;
                }

                const activeVideo = videos[activeSlot];
                if (!activeVideo || currentIndex < 0) {
                    return;
                }

                if (activeVideo.ended) {
                    await handleBoundaryTransition({ index: activeSlot, video: activeVideo, allowRestartCurrent: true });
                    return;
                }

                const remaining = Number.isFinite(activeVideo.duration)
                    ? activeVideo.duration - activeVideo.currentTime
                    : Number.POSITIVE_INFINITY;
                const isActivelyPlaying = activeVideo.readyState >= 2 && !activeVideo.paused;

                if (isActivelyPlaying) {
                    notePlaybackProgress(activeVideo);
                    if ((Date.now() - lastPlaybackProgressAtMs) <= playbackStallThresholdMs) {
                        return;
                    }
                }

                if (activeVideo.paused && remaining > (handoffWindowSeconds + 0.1) && activeVideo.src) {
                    const resumed = await playVideo(activeVideo);
                    if (resumed) {
                        bumpPlaybackHeartbeat();
                        notePlaybackProgress(activeVideo);
                        return;
                    }
                }

                if ((Date.now() - lastPlaybackProgressAtMs) > playbackStallThresholdMs) {
                    await recoverPlayback('Playback stalled');
                }
            };

            window.setInterval(async () => {
                if (transitionInFlight || boundaryTransitionInFlight || recoveryInFlight) {
                    return;
                }
                try {
                    await fetchPlaylist();
                    await preloadIndex(getNextStep());
                } catch (error) {
                    setError('Playlist refresh failed. Check that the folder still exists.');
                    console.warn('Playlist refresh failed', error);
                }
            }, playlistRefreshIntervalMs);

            window.setInterval(() => {
                void runPlaybackWatchdog();
            }, playbackWatchdogIntervalMs);

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    lastPlaybackProgressAtMs = Date.now();
                    void runPlaybackWatchdog();
                }
            });

            loopModeEl.addEventListener('change', async () => {
                loopMode = loopModeEl.value === 'tail' ? 'tail' : 'all';
                tailRoundsCompleted = 0;
                playAllRoundActive = false;
                deactivateAllRoundAfterStep = false;
                updateStatus();
                await preloadIndex(getNextStep());
            });

            pingPongModeEl.addEventListener('change', async () => {
                pingPongEnabled = pingPongModeEl.checked;
                pingPongDirection = 1;
                await preloadIndex(getNextStep());
            });

            tailCountEl.addEventListener('input', async () => {
                tailCount = Number(tailCountEl.value) || 2;
                tailRoundsCompleted = 0;
                playAllRoundActive = false;
                deactivateAllRoundAfterStep = false;
                syncTailControls();
                await preloadIndex(getNextStep());
            });

            fullscreenToggleEl.addEventListener('click', () => {
                void toggleFullscreen();
            });

            ['mousemove', 'touchstart', 'click'].forEach((eventName) => {
                playerShellEl.addEventListener(eventName, () => {
                    if (!isFullscreenActive()) {
                        return;
                    }
                    showFullscreenOverlay();
                    scheduleFullscreenOverlayDim();
                }, { passive: true });
            });

            document.addEventListener('fullscreenchange', syncFullscreenButton);
            document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
            syncFullscreenButton();

            startPlayback().catch((error) => {
                setError('Initial playback failed. Press play on the controls or verify the folder path.');
                console.warn('Initial playback failed', error);
            });
        })();
    </script>
</body>
</html>`;

/**
 * API Routes
 */
const routes = {
    "/continuous-video": async (req, res) => {
        const requestedFolder = typeof req.query.folder === "string" ? req.query.folder : "";
        try {
            const folder = requestedFolder.trim()
                ? requestedFolder
                : getNewestContinuousPartsFolder();
            if (folder.trim()) {
                getContinuousFolderPath(folder);
            }
            res.set("content-type", "text/html");
            res.send(renderContinuousVideoPage(folder));
        } catch (error) {
            res.set("content-type", "text/html");
            res.send(renderContinuousVideoPage(requestedFolder, error.message));
        }
    },

    "/continuous-video-api": async (req, res) => {
        try {
            res.json(getContinuousVideoFiles(req.query.folder));
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    },

    "/continuous-video-file/*": async (req, res) => {
        try {
            const relativeFilePath = decodeURIComponent(req.params[0]);
            const absoluteFilePath = path.resolve(repoRoot, relativeFilePath);
            const relativePath = path.relative(repoRoot, absoluteFilePath);

            if (
                relativePath.startsWith("..") ||
                path.isAbsolute(relativePath) ||
                !fs.existsSync(absoluteFilePath) ||
                !fs.statSync(absoluteFilePath).isFile()
            ) {
                res.status(404).send("Video file not found");
                return;
            }

            const ext = path.extname(absoluteFilePath).toLowerCase();
            let contentType = "video/mp4";
            if (ext === ".webm") contentType = "video/webm";
            if (ext === ".mov") contentType = "video/quicktime";
            streamMedia(req, res, absoluteFilePath, contentType);
        } catch (error) {
            res.status(400).send("Invalid file path");
        }
    },

    "/youtube": async function (req, res) {
        const firstItem = await store.shiftFile(this.saveItemPath);
        return sendFile(res, firstItem);
    },

    "/dailymotion": function (req, res) {
        sendFile(res, req.app.locals.imageDir || "../../GENERATIONS/dailymotion");
    },

    "/rnd": async function (req, res) {
        try {
            const result = await storeFunction.getRandomItem();
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": Buffer.from(result.imageBase64.split(',')[1], 'base64').length
            });
            res.end(Buffer.from(result.imageBase64.split(',')[1], 'base64'));
        } catch (error) {
            res.status(500).send("Error fetching random image");
        }
    },

    "/": async (req, res) => {
        res.set("content-type", "text/html");

        // Get latest generation for home
        try {
            const menu = _.createMenu(defaultMenuPath);
            const latestImage = await storeFunction.newestFile();

            //console.log("Latest image:", latestImage);

            const infoJson = await getInfoJson(latestImage);
            const latestImageJson = await getFileJSON(latestImage.metadata.jsonPath);

            const data = {
                latestImageJson,
                infoJson,
                menu,
                isHome: true,
                images: latestImage ? [latestImage] : undefined
            };

            res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
        } catch (error) {
            console.error("Error getting home data:", error);
            const data = { menu: _.createMenu(defaultMenuPath), isHome: true };
            res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
        }
    },

    "/img": async (req, res) => {
        const data = await storeFunction.newestFile();

        res.json(data);
    },

    "/daily-doasis": (req, res) => res.redirect("https://dailydoase.de/"),

    "/:model/:folderName/": async (req, res) => {

        try {
            const indexHtml = fs.readFileSync(path.join(__dirname,
                "../web/dist/index-template.hbs"), "utf-8");

            const actFolderName = path.join(req.params.folderName);
            const autoplay = req.query.autoplay ? 1 : 0;

            // Get images for folder
            const images = await storeFunction.getAllFilesFromFolderForImages(actFolderName);
//console.log(`Found ${images.length} images in folder ${images}`,actFolderName);
            if (req.query.sort === "desc") {
                images.reverse();
            }

            let infoJson = {};
            if (images[0] && images[0].metadata && images[0].metadata.fullPath) {
                infoJson = await getInfoJson(images[0]);
            } else {
                console.warn("No valid image object found for infoJson:", images[0]);
            }

            const data = {
                menu: _.createMenu(defaultMenuPath, req.params.folderName),
                images,
                pageClass: "folder",
                autoplay,
                infoJson,
                frame: req.query.frame ? true : undefined,
            };

            res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
        } catch (error) {
            console.error("Error handling folder request:", error);
            res.status(500).send("Internal Server Error");
        }
    },

    "/:model/:folderName/:file": async (req, res) => {
        try {

            const generation = await storeFunction.getFile(req.params.folderName, req.params.file);
            const ext = path.extname(req.params.file).toLowerCase();
            if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
                  if (generation.metadata && generation.metadata.fullPath && fs.existsSync(generation.metadata.fullPath)) {
                        let contentType = "image/png";
                        if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
                        if (ext === ".webp") contentType = "image/webp";
                        res.setHeader("Content-Type", contentType);
                        const stream = fs.createReadStream(generation.metadata.fullPath);
                        stream.pipe(res);
                        return;
                    } else {
                        res.status(404).send("Image file not found");
                        return;
                    }
            } else if (ext === ".json") {
                res.json({
                    name: generation.json.words?.map(i => i[0]).join("-") || "",
                    description: generation.json.prompt,
                    image: `${baseUrl}/v${generation.src}`
                });
            } else if (ext === ".mp4" || ext === ".webm" || ext === ".mov") {
                // Video file with HTTP Range streaming for quick metadata fetch & seeking
                const videoPath = generation.metadata.fullPath;
                if (videoPath && fs.existsSync(videoPath)) {
                    let contentType = "video/mp4";
                    if (ext === ".webm") contentType = "video/webm";
                    if (ext === ".mov") contentType = "video/quicktime";
                    streamMedia(req, res, videoPath, contentType);
                } else {
                    console.error("Invalid video path:", { generation });
                    res.status(404).send("Video file not found");
                }
            } else if (ext === ".mp3" || ext === ".wav" || ext === ".ogg") {
                // Audio file



                const audioPath = generation.metadata.fullPath;
                if (fs.existsSync(audioPath)) {
                    let contentType = "audio/mpeg";
                    if (ext === ".wav") contentType = "audio/wav";
                    if (ext === ".ogg") contentType = "audio/ogg";
                    streamMedia(req, res, audioPath, contentType);
                } else {
                    res.status(404).send("Audio file not found");
                }
            } else {
                res.status(415).send("Unsupported file type");
            }
        } catch (error) {
            console.error("Error handling file request:", error);
            res.status(500).send("Internal Server Error");
        }
    },
    "/:model/:folderName/:file/about": async (req, res) => {


    },
};

// Helper function to send files
async function sendFile(res, file) {
    try {
        let filePath = file.fullPath;
        if (!filePath) {
            filePath = path.join(file.parentPath, file.name);
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                res.status(500).send("Internal Server Error while sending");
            }
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).send("Internal Server Error");
    }
}

/**
 * Initialize the application
 */
module.exports.init = (getNext = () => { }, config = { hello: "default" }) => {
    app.use(express.static(path.join(__dirname, "../web/dist")));
    __.getNext = getNext;

    // Bind and set up all routes
    Object.entries(routes).forEach(([route, handler]) => router.get(route, handler.bind(config)));

    app.use("", router);
    app.listen(port, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${port}/`));
};
