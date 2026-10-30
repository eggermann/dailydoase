const express = require("express");
const path = require("path");
const { execFileSync } = require("child_process");
const { createHash } = require("crypto");
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
let cachedContinuousWorktrees = null;
let cachedContinuousWorktreesAt = 0;
let cachedContinuousMediaIndex = null;
let cachedContinuousMediaIndexAt = 0;
const allContinuousGenerationsKey = "all-generations";
const latestContinuousGenerationKey = "latest-generation";
const exhibitionCampaignKey = "exhibition-campaign";
const exhibitionCampaignPath = "/news/exhibition/mac-mini/scene-campaign-10h/";
const selectedContinuousGenerationsPrefix = "selected-generations:";

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

const isPathWithin = (root, candidate) => {
    const relativePath = path.relative(root, candidate);
    return relativePath === ""
        || (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
};

const getContinuousWorktrees = () => {
    if (cachedContinuousWorktrees && Date.now() - cachedContinuousWorktreesAt < 10_000) {
        return cachedContinuousWorktrees;
    }

    const output = execFileSync("git", ["-C", repoRoot, "worktree", "list", "--porcelain"], { encoding: "utf8" });
    const roots = output.split(/\r?\n/)
        .filter((line) => line.startsWith("worktree "))
        .map((line) => path.resolve(line.slice("worktree ".length)));
    const baseKeys = roots.map((root) => path.basename(root) === "dailydoase"
        ? path.basename(path.dirname(root))
        : path.basename(root));
    const keyCounts = new Map();
    baseKeys.forEach((key) => keyCounts.set(key, (keyCounts.get(key) || 0) + 1));

    cachedContinuousWorktrees = roots.map((root, index) => {
        const baseKey = baseKeys[index].replace(/[^a-zA-Z0-9._-]/g, "-");
        const key = keyCounts.get(baseKeys[index]) > 1
            ? `${baseKey}-${createHash("sha1").update(root).digest("hex").slice(0, 6)}`
            : baseKey;
        return { root, key };
    });
    cachedContinuousWorktreesAt = Date.now();
    return cachedContinuousWorktrees;
};

const getContinuousPathReference = (absolutePath) => {
    if (isPathWithin(repoRoot, absolutePath)) {
        return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
    }

    const worktree = getContinuousWorktrees().find((item) => isPathWithin(item.root, absolutePath));
    if (!worktree) throw new Error("Path is outside the repository worktrees");
    const worktreeRelativePath = path.relative(worktree.root, absolutePath).split(path.sep).join("/");
    return ["worktrees", worktree.key, worktreeRelativePath].filter(Boolean).join("/");
};

const readGenerationJson = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
            console.warn("Could not read generation status file:", filePath, error.message);
        }
        return null;
    }
};

const getLiveGenerationRunDirectories = () => {
    try {
        const processes = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
        const runDirectories = new Set();
        const rows = processes.split("\n").map((line) => {
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
            return match ? { pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] } : null;
        }).filter(Boolean);
        const exhibitionRunnerPids = new Set();
        for (const row of rows) {
            const runnerScriptMarker = "/eu-reski-news/scripts/exhibition-runner.mjs";
            if (row.command.includes(runnerScriptMarker)) exhibitionRunnerPids.add(row.pid);
            if (!row.command.includes("/eu-reski-news/scripts/run-news-scene-image-iteration.mjs")) continue;
            const resumeMatch = row.command.match(/--resume-run=(?:"([^"]+)"|'([^']+)'|(\S+))/);
            const resumedDirectory = resumeMatch?.[1] || resumeMatch?.[2] || resumeMatch?.[3];
            if (resumedDirectory && path.isAbsolute(resumedDirectory)) {
                runDirectories.add(fs.realpathSync(resumedDirectory));
                continue;
            }
            if (!exhibitionRunnerPids.has(row.parentPid)) continue;

            const iteratorPlanMatch = row.command.match(/--iterator-plan=(?:"([^"]+)"|'([^']+)'|(\S+))/);
            const iteratorPlanPath = iteratorPlanMatch?.[1] || iteratorPlanMatch?.[2] || iteratorPlanMatch?.[3];
            const outputDirectoryMatch = row.command.match(/--output-dir=(?:"([^"]+)"|'([^']+)'|(\S+))/);
            const outputDirectory = outputDirectoryMatch?.[1] || outputDirectoryMatch?.[2] || outputDirectoryMatch?.[3];
            const statePath = iteratorPlanPath && path.isAbsolute(iteratorPlanPath)
                ? path.join(path.dirname(iteratorPlanPath), "exhibition-state.json")
                : outputDirectory && path.isAbsolute(outputDirectory)
                    ? path.join(outputDirectory, "exhibition-state.json")
                    : null;
            if (!statePath) continue;
            const exhibitionState = readGenerationJson(statePath) || {};
            const iteratorPlan = iteratorPlanPath && readGenerationJson(iteratorPlanPath);
            const workerKey = iteratorPlan?.workerKey;
            const workerRun = workerKey ? exhibitionState.sceneWorkers?.[workerKey] : null;
            const activeDirectories = workerRun?.runDirectory
                ? [workerRun.runDirectory]
                : [exhibitionState.runDirectory];
            for (const runDirectory of activeDirectories) {
                if (typeof runDirectory === "string" && path.isAbsolute(runDirectory)) runDirectories.add(fs.realpathSync(runDirectory));
            }
        }
        return runDirectories;
    } catch (error) {
        console.warn("Could not inspect live generation processes:", error.message);
        return new Set();
    }
};

const getIterationProgress = (iterationDirectory, liveMarker, runManifest) => {
    const record = readGenerationJson(path.join(iterationDirectory, "record.json")) || {};
    const scenes = record.filmPlan?.scenePlan || record.plan?.scenes || [];
    const sceneCount = Number(record.sceneCount || scenes.length || liveMarker.sceneCount || 0);
    const isFileInsideIteration = (filePath) => {
        if (typeof filePath !== "string" || !filePath.trim()) return false;
        const absolutePath = path.resolve(iterationDirectory, filePath);
        return isPathWithin(iterationDirectory, absolutePath)
            && fs.existsSync(absolutePath)
            && fs.statSync(absolutePath).isFile();
    };
    const imageReadyCount = sceneCount
        ? Array.from({ length: sceneCount }, (_, index) => {
            const scene = scenes[index];
            const result = record.results?.[index];
            return isFileInsideIteration(result?.path)
                || isFileInsideIteration(scene?.startImagePath)
                || fs.existsSync(path.join(iterationDirectory, "media", `scene-${scene?.index || index + 1}-first-frame.png`));
        }).filter(Boolean).length
        : 0;
    const videoScenes = scenes.filter((scene, index) => (
        scene.videoMode !== "first_last_frame"
        && record.videoResults?.[index]?.status !== "rejected_by_provider_moderation"
    ));
    const videoReadyCount = videoScenes.filter((scene, index) => {
        const sceneIndex = scene.index || index + 1;
        return isFileInsideIteration(record.videoResults?.[index]?.path)
            || fs.existsSync(path.join(iterationDirectory, "media", `scene-${sceneIndex}-video.mp4`));
    }).length;
    const videoExpectedCount = videoScenes.length;
    let stage = liveMarker.stage || null;
    if (!stage) {
        if (record.status === "preparing" && record.plan?.scenes?.length) stage = "image_generation";
        else if (record.status === "preparing" && fs.existsSync(path.join(iterationDirectory, "auto-director-request.json"))) {
            stage = fs.existsSync(path.join(iterationDirectory, "auto-director-response.json"))
                ? "story_planning"
                : "auto_director";
        } else if (record.status === "preparing") stage = "story_planning";
        else if (imageReadyCount < sceneCount) stage = "image_generation";
        else if (videoExpectedCount > videoReadyCount) stage = "video_generation";
        else if (record.filmPlan) stage = "film_assembly";
        else stage = "iteration_finalizing";
    }
    const markerVideoReady = Number.isFinite(liveMarker.videoReadyCount) ? liveMarker.videoReadyCount : videoReadyCount;
    const markerVideoPending = Number.isFinite(liveMarker.videoPendingCount)
        ? liveMarker.videoPendingCount
        : Math.max(0, videoExpectedCount - videoReadyCount);

    return {
        stage,
        articleTitle: liveMarker.articleTitle || record.article?.title || null,
        sceneCount,
        sceneIndex: liveMarker.sceneIndex || null,
        imageReadyCount,
        videoReadyCount: markerVideoReady,
        videoExpectedCount,
        videoPendingCount: markerVideoPending,
        error: liveMarker.error || null,
    };
};

const getContinuousFolderPath = (folder) => {
    if (!folder || typeof folder !== "string") {
        throw new Error("Missing folder query parameter");
    }

    const trimmedFolder = folder.trim();
    if (trimmedFolder.startsWith("worktrees/")) {
        const [, worktreeKey, ...relativeParts] = trimmedFolder.split("/");
        const worktree = getContinuousWorktrees().find((item) => item.key === worktreeKey);
        if (!worktree || !relativeParts.length) throw new Error("Unknown worktree generation folder");

        const absolutePath = path.resolve(worktree.root, relativeParts.join(path.sep));
        const allowedRoots = [path.join(worktree.root, "eu-reski-news/GENERATIONS")]
            .filter((root) => fs.existsSync(root));
        const isAllowed = allowedRoots.some((root) => {
            const realRoot = fs.realpathSync(root);
            const realPath = fs.existsSync(absolutePath) ? fs.realpathSync(absolutePath) : absolutePath;
            return isPathWithin(realRoot, realPath);
        });
        if (!isAllowed || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
            throw new Error("Folder must be inside a worktree generation directory");
        }

        return { absolutePath, relativePath: trimmedFolder.split(path.sep).join("/") };
    }

    const resolvedFolder = path.resolve(repoRoot, trimmedFolder);

    if (
        !isPathWithin(repoRoot, resolvedFolder) ||
        !fs.existsSync(resolvedFolder) ||
        !fs.statSync(resolvedFolder).isDirectory()
    ) {
        throw new Error("Folder must be an existing directory inside the repository");
    }

    return {
        absolutePath: resolvedFolder,
        relativePath: path.relative(repoRoot, resolvedFolder).split(path.sep).join("/"),
    };
};

const getSelectedContinuousGenerationSelection = (folder) => {
    if (typeof folder !== "string" || !folder.startsWith(selectedContinuousGenerationsPrefix)) return null;
    let selection;
    try {
        selection = JSON.parse(folder.slice(selectedContinuousGenerationsPrefix.length));
    } catch {
        throw new Error("Invalid selected generation folders");
    }
    const selectedPaths = Array.isArray(selection) ? selection : selection?.paths;
    if (!Array.isArray(selectedPaths) || !selectedPaths.length || selectedPaths.length > 50
        || selectedPaths.some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error("Select between 1 and 50 generation folders");
    }
    const baseFolder = Array.isArray(selection) ? null : selection.baseFolder;
    if (baseFolder !== null && baseFolder !== undefined
        && (typeof baseFolder !== "string" || baseFolder.length > 2048)) {
        throw new Error("Invalid base folder for selected generations");
    }
    return { paths: [...new Set(selectedPaths)], baseFolder: baseFolder || null };
};

const getNewestContinuousPartsFolder = () => {
    const folders = getContinuousMediaFolders();
    if (!folders.some((folder) => folder.videoCount > 0)) throw new Error("No videos found in EU news generation outputs");
    return latestContinuousGenerationKey;
};

const getContinuousMediaIndex = () => {
    if (cachedContinuousMediaIndex && Date.now() - cachedContinuousMediaIndexAt < 3_000) {
        return cachedContinuousMediaIndex;
    }

    const activeRunDirectories = getLiveGenerationRunDirectories();
    const rootsByPath = new Map();
    const addRoot = (root) => {
        if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
            rootsByPath.set(path.resolve(root), getContinuousPathReference(path.resolve(root)));
        }
    };
    for (const worktree of getContinuousWorktrees()) {
        addRoot(path.join(worktree.root, "eu-reski-news/GENERATIONS"));
    }
    const foldersByPath = new Map();
    const stack = [...rootsByPath].map(([absolutePath, referencePath]) => ({
        absolutePath,
        referencePath,
        generationAncestors: [],
    }));

    while (stack.length) {
        const {
            absolutePath: currentDir,
            referencePath: currentReferencePath,
            generationAncestors,
        } = stack.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        let currentGenerationAncestors = generationAncestors;

        if (fs.existsSync(path.join(currentDir, "run.json"))) {
            const runManifest = readGenerationJson(path.join(currentDir, "run.json")) || {};
            const generation = {
                path: currentReferencePath,
                absolutePath: currentDir,
                modifiedAt: fs.statSync(currentDir).mtimeMs,
                latestVideoMtimeMs: 0,
                videoCount: 0,
                files: [],
                activeIterations: [],
                runStatus: runManifest.status || "unknown",
                profile: runManifest.profile || null,
                iteratorNames: runManifest.iteratorNames || [],
                autoMode: runManifest.autoDirectorSceneCount === true
                    || runManifest.generationSettings?.autoMode === true
                    || runManifest.runOptions?.["auto-mode"] === true,
                sceneSchedule: runManifest.sceneSchedule || null,
                pendingMedia: runManifest.pendingMedia || [],
                iterations: runManifest.iterations || [],
                generationSettings: runManifest.generationSettings || {},
                runOptions: runManifest.runOptions || {},
                runnerActive: activeRunDirectories.has(fs.realpathSync(currentDir)),
            };
            foldersByPath.set(generation.path, generation);
            currentGenerationAncestors = [...generationAncestors, generation];
        }

        const iterationMatch = path.basename(currentDir).match(/^iteration-(\d+)$/i);
        if (iterationMatch && currentGenerationAncestors.length) {
            try {
                const liveMarker = JSON.parse(fs.readFileSync(path.join(currentDir, "live.json"), "utf8"));
                const isRunning = liveMarker.status === "running" && isContinuousProcessAlive(liveMarker.processId);
                const isInterrupted = liveMarker.status === "interrupted"
                    || (liveMarker.status === "running" && !isContinuousProcessAlive(liveMarker.processId));
                const isPendingMedia = liveMarker.status === "pending_media";
                if (isRunning || isInterrupted || isPendingMedia) {
                    for (const generation of currentGenerationAncestors) {
                        const progress = getIterationProgress(currentDir, liveMarker, generation);
                        generation.activeIterations.push({
                            iteration: iterationMatch[1],
                            run: generation.path,
                            folder: path.relative(generation.absolutePath, currentDir).split(path.sep).join("/"),
                            startedAt: liveMarker.startedAt || null,
                            updatedAt: liveMarker.updatedAt || null,
                            status: isRunning ? "running" : isPendingMedia ? "pending_media" : "interrupted",
                            ...progress,
                        });
                    }
                }
            } catch (error) {
                if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
                    console.warn("Failed to read live iteration marker:", currentDir, error.message);
                }
            }
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name === "archive" || entry.name === ".git" || entry.name === "node_modules") {
                    continue;
                }

                const entryPath = path.join(currentDir, entry.name);
                const childRelativePath = path.relative(currentDir, entryPath).split(path.sep).join("/");
                stack.push({
                    absolutePath: entryPath,
                    referencePath: `${currentReferencePath}/${childRelativePath}`,
                    generationAncestors: currentGenerationAncestors,
                });
                continue;
            }

            if (!entry.isFile() || !/\.(mp4|webm|mov)$/i.test(entry.name) || !currentGenerationAncestors.length) {
                continue;
            }

            const fileAbsolutePath = path.join(currentDir, entry.name);
            const stat = fs.statSync(fileAbsolutePath);
            for (const generation of currentGenerationAncestors) {
                generation.videoCount += 1;
                generation.latestVideoMtimeMs = Math.max(generation.latestVideoMtimeMs, stat.mtimeMs);
                generation.files.push({
                    absolutePath: fileAbsolutePath,
                    relativeMediaPath: path.relative(generation.absolutePath, fileAbsolutePath).split(path.sep).join("/"),
                    name: entry.name,
                    size: stat.size,
                    mtimeMs: stat.mtimeMs,
                });
            }
        }
    }

    for (const generation of foldersByPath.values()) {
        generation.runnerActive ||= activeRunDirectories.has(path.resolve(generation.absolutePath));
        const seenIterations = new Set(generation.activeIterations.map((item) => item.folder));
        const videosEnabled = generation.generationSettings.videosAfterEachIteration === true
            || generation.runOptions["videos-after-each-iteration"] === true;
        if (!videosEnabled) continue;
        for (const entry of generation.iterations) {
            const iterationDirectory = path.resolve(generation.absolutePath, entry.directory || "");
            const relativeDirectory = path.relative(generation.absolutePath, iterationDirectory).split(path.sep).join("/");
            if (!relativeDirectory || !isPathWithin(generation.absolutePath, iterationDirectory) || seenIterations.has(relativeDirectory)) continue;
            const progress = getIterationProgress(iterationDirectory, {}, generation);
            if (!progress.videoExpectedCount || progress.videoPendingCount === 0) continue;
            generation.activeIterations.push({
                iteration: path.basename(iterationDirectory).match(/^iteration-(\d+)$/)?.[1] || String(entry.index || ""),
                run: generation.path,
                folder: relativeDirectory,
                startedAt: null,
                updatedAt: null,
                status: "pending_media",
                ...progress,
            });
        }
    }

    cachedContinuousMediaIndex = [...foldersByPath.values()]
        .sort((a, b) => b.latestVideoMtimeMs - a.latestVideoMtimeMs
            || b.absolutePath.length - a.absolutePath.length
            || b.modifiedAt - a.modifiedAt);
    cachedContinuousMediaIndexAt = Date.now();
    return cachedContinuousMediaIndex;
};

const getContinuousMediaFolders = () => getContinuousMediaIndex().map((folder) => ({
    path: folder.path,
    modifiedAt: folder.modifiedAt,
    latestVideoMtimeMs: folder.latestVideoMtimeMs,
    videoCount: folder.videoCount,
    runStatus: folder.runStatus,
    runnerActive: folder.runnerActive,
    profile: folder.profile,
    iteratorNames: folder.iteratorNames,
    autoMode: folder.autoMode,
    nextStartAtMs: folder.sceneSchedule?.nextStartAtMs || null,
    pendingMediaCount: folder.pendingMedia.length,
    activeIterations: folder.activeIterations,
    activeIterationCount: folder.activeIterations.filter((item) => item.status === "running").length,
    pendingVideoCount: folder.activeIterations.filter((item) => item.status === "pending_media").length,
    interruptedIterationCount: folder.activeIterations.filter((item) => item.status === "interrupted").length,
    iterationCount: folder.activeIterations.length,
    disabled: folder.videoCount === 0 && folder.activeIterations.length === 0 && !folder.runnerActive,
}));

const isContinuousGenerationActive = (generation) => generation.runnerActive
    || generation.activeIterations.some((iteration) => iteration.status === "running" || iteration.status === "pending_media");

const getContinuousGenerationFiles = (folders) => {
    const filesByPath = new Map();
    for (const folder of folders) {
        for (const file of folder.files) {
            const previous = filesByPath.get(file.absolutePath);
            if (!previous || folder.absolutePath.length > previous.generationRootLength) {
                filesByPath.set(file.absolutePath, { ...file, generationRootLength: folder.absolutePath.length });
            }
        }
    }
    return [...filesByPath.values()];
};

const isContinuousProcessAlive = (processId) => {
    if (!Number.isInteger(processId) || processId <= 0) return false;
    try {
        process.kill(processId, 0);
        return true;
    } catch (error) {
        return error.code === "EPERM";
    }
};

const getContinuousVideoKind = (name, relativePath) => {
    const normalizedPath = relativePath.replaceAll("\\", "/").toLowerCase();
    const normalizedName = name.toLowerCase();
    if (/scene-\d+-to-\d+/.test(normalizedName)) return "bridge";
    if (/\/media\/scene-\d+-video\./.test(`/${normalizedPath}`)) return "scene";
    if (normalizedName.includes("with-title-card")) return "iteration-title-card";
    if (normalizedPath.includes("/title-cards/")) return "title-card";
    if (/eu-reski-live-(full|random-bridges)|first-\d+-glued/.test(normalizedName)) return "glued-film";
    if (normalizedName.includes("gesamtfilm") || normalizedName.includes("full-film")) return "full-film";
    if (/iteration-\d+/.test(normalizedPath)) return "iteration-film";
    return "other";
};

const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

const getContinuousVideoFiles = (folder, includeActiveGenerations = false) => {
    const generationIndex = getContinuousMediaIndex();
    let mediaFiles;
    let activeIterations = [];
    let sortByTimestamp = false;

    const selectedGenerationSelection = getSelectedContinuousGenerationSelection(folder);
    if (folder === exhibitionCampaignKey) {
        const campaignGenerations = generationIndex.filter((item) =>
            item.path.replaceAll("\\", "/").includes(exhibitionCampaignPath));
        const completedFilms = getContinuousGenerationFiles(campaignGenerations).filter((file) =>
            /^iteration-\d+-with-title-card(?:-audio-normalized)?\.mp4$/i.test(file.name));
        mediaFiles = completedFilms.length
            ? completedFilms
            : getContinuousGenerationFiles(generationIndex.filter((item) =>
                item.videoCount > 0 && !item.path.replaceAll("\\", "/").includes(exhibitionCampaignPath)));
        activeIterations = campaignGenerations.flatMap((item) => item.activeIterations);
        sortByTimestamp = true;
    } else if (selectedGenerationSelection) {
        const selectedFolders = new Map();
        const addFolder = (selectedFolder) => {
            if (selectedFolder === allContinuousGenerationsKey) {
                for (const generation of generationIndex.filter((item) => item.videoCount > 0)) {
                    selectedFolders.set(generation.absolutePath, generation);
                }
                return;
            }
            if (selectedFolder === latestContinuousGenerationKey) {
                const latestGeneration = generationIndex.find((item) => item.videoCount > 0);
                if (latestGeneration) selectedFolders.set(latestGeneration.absolutePath, latestGeneration);
                return;
            }
            const { absolutePath } = getContinuousFolderPath(selectedFolder);
            const generation = generationIndex.find((item) => item.absolutePath === absolutePath);
            if (!generation) throw new Error("Selected folder is not a generation run");
            selectedFolders.set(absolutePath, generation);
        };
        selectedGenerationSelection.paths.forEach(addFolder);
        if (selectedGenerationSelection.baseFolder) addFolder(selectedGenerationSelection.baseFolder);
        const selected = [...selectedFolders.values()];
        mediaFiles = getContinuousGenerationFiles(selected);
        activeIterations = selected.flatMap((item) => item.activeIterations);
        sortByTimestamp = true;
    } else if (folder === allContinuousGenerationsKey) {
        mediaFiles = getContinuousGenerationFiles(generationIndex.filter((item) => item.videoCount > 0));
        activeIterations = generationIndex.flatMap((item) => item.activeIterations);
        sortByTimestamp = true;
    } else if (folder === latestContinuousGenerationKey) {
        const latestGeneration = generationIndex.find((item) => item.videoCount > 0);
        mediaFiles = latestGeneration ? [...latestGeneration.files] : [];
        activeIterations = latestGeneration ? [...latestGeneration.activeIterations] : [];
    } else {
        const { absolutePath, relativePath } = getContinuousFolderPath(folder);
        const indexedFolder = generationIndex.find((item) => item.absolutePath === absolutePath);
        if (indexedFolder) {
            mediaFiles = [...indexedFolder.files];
            activeIterations = [...indexedFolder.activeIterations];
        } else {
            const ignoredDirectoryNames = new Set([".git", "archive", "node_modules"]);
            mediaFiles = [];
            const stack = [absolutePath];
            while (stack.length) {
                const currentDir = stack.pop();
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        if (!ignoredDirectoryNames.has(entry.name)) stack.push(path.join(currentDir, entry.name));
                        continue;
                    }
                    if (!entry.isFile() || !/\.(mp4|webm|mov)$/i.test(entry.name)) continue;
                    const fileAbsolutePath = path.join(currentDir, entry.name);
                    const stat = fs.statSync(fileAbsolutePath);
                    mediaFiles.push({
                        absolutePath: fileAbsolutePath,
                        relativeMediaPath: path.relative(absolutePath, fileAbsolutePath).split(path.sep).join("/"),
                        name: entry.name,
                        size: stat.size,
                        mtimeMs: stat.mtimeMs,
                    });
                }
            }
        }
    }

    if (includeActiveGenerations && folder !== exhibitionCampaignKey) {
        const activeGenerations = generationIndex.filter((generation) =>
            isContinuousGenerationActive(generation)
            || (folder === latestContinuousGenerationKey
                && generation.path.replaceAll("\\", "/").includes(exhibitionCampaignPath)));
        const activeFiles = getContinuousGenerationFiles(activeGenerations);
        mediaFiles = [...new Map([...(mediaFiles || []), ...activeFiles]
            .map((file) => [file.absolutePath, file])).values()];
        activeIterations = [...activeIterations, ...activeGenerations.flatMap((item) => item.activeIterations)];
        sortByTimestamp = true;
    }

    const sortedMediaFiles = mediaFiles || [];
    sortedMediaFiles.sort((a, b) => sortByTimestamp
        ? a.mtimeMs - b.mtimeMs || a.absolutePath.localeCompare(b.absolutePath, undefined, { numeric: true, sensitivity: "base" })
        : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

    const files = sortedMediaFiles.map((mediaFile) => {
            const { absolutePath: fileAbsolutePath, relativeMediaPath, name, size, mtimeMs } = mediaFile;
            const fileDirectory = path.dirname(fileAbsolutePath);
            const jsonAbsolutePath = path.join(
                fileDirectory,
                `${path.basename(name, path.extname(name))}.json`,
            );
            const relativeFilePath = getContinuousPathReference(fileAbsolutePath);
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
                id: createHash("sha1").update(fileAbsolutePath).digest("hex"),
                name,
                size,
                mtimeMs,
                src: `/continuous-video-file/${encodeURI(relativeFilePath)}`,
                contentType,
                prompt,
                kind: getContinuousVideoKind(name, relativeMediaPath),
            };
    });

    return {
        folder,
        count: files.length,
        files,
        activeIterations: [...new Map(activeIterations.map((item) => [item.run + item.folder + item.iteration, item])).values()],
    };
};

const renderContinuousVideoPage = (folder = "", initialError = "") => {
    const selectedGenerationSelection = getSelectedContinuousGenerationSelection(folder);
    const selectedFolderNames = selectedGenerationSelection?.paths.map((selectedPath) => path.basename(selectedPath)) || [];
    const folderLabel = selectedGenerationSelection
        ? `Selected generations · ${selectedFolderNames.join(", ")}`
        : folder || "paste a folder path below";
    const folderInputValue = selectedGenerationSelection?.baseFolder || (selectedGenerationSelection ? "" : folder);

    return `<!DOCTYPE html>
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
            --fade-ms: 260ms;
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
        body.kiosk-mode .page { width: 100vw; margin: 0; padding: 0; }
        body.kiosk-mode .meta,
        body.kiosk-mode .generation-status-panel,
        body.kiosk-mode .status { display: none; }
        body.kiosk-mode .player-shell {
            width: 100vw;
            height: calc(100vh - 48px);
            aspect-ratio: auto;
            border-radius: 0;
            box-shadow: none;
        }
        body.kiosk-mode .player-overlay { display: none; }
        .video-controls-toolbar {
            display: flex;
            justify-content: flex-start;
            margin: 8px 0;
        }
        .video-controls-toolbar button {
            min-height: 48px;
            padding: 12px 20px;
            border: 1px solid rgba(255, 255, 255, 0.32);
            border-radius: 12px;
            background: #454545;
            color: #fff;
            font: inherit;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
        }
        .video-controls-toolbar button:hover { background: #5a5a5a; }
        body.kiosk-mode .video-controls-toolbar {
            height: 48px;
            margin: 0;
            padding: 6px 12px;
        }
        .meta {
            margin-bottom: 16px;
            padding: 16px 18px;
            background: var(--panel);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 18px;
            backdrop-filter: blur(10px);
        }
        .generation-status-panel {
            margin: 0 0 16px;
            padding: 16px 18px;
            background: rgba(22, 24, 18, 0.96);
            border: 1px solid rgba(224, 255, 91, 0.24);
            border-radius: 16px;
        }
        .generation-status-heading {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 12px;
            margin-bottom: 12px;
        }
        .generation-status-heading h2 {
            margin: 0;
            font-size: 1.08rem;
        }
        .generation-status-summary,
        .generation-status-empty {
            color: var(--muted);
            font-size: 0.9rem;
        }
        .generation-status-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
            gap: 10px;
        }
        .generation-status-history {
            grid-column: 1 / -1;
            padding-top: 4px;
        }
        .generation-status-history > summary {
            color: var(--muted);
            cursor: pointer;
            font-weight: 700;
        }
        .generation-status-history .generation-status-list { margin-top: 10px; }
        .generation-status-history-lines { margin: 8px 0 0; }
        .generation-status-history-lines p { margin: 5px 0; }
        .generation-status-card {
            min-width: 0;
            padding: 12px 14px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            background: rgba(0, 0, 0, 0.22);
        }
        .generation-status-card.is-running {
            border-color: rgba(224, 255, 91, 0.5);
        }
        .generation-status-card.is-pending {
            border-color: rgba(255, 191, 92, 0.5);
        }
        .generation-status-card.is-interrupted {
            border-color: rgba(255, 127, 111, 0.5);
        }
        .generation-status-card h3 {
            margin: 0 0 5px;
            font-size: 0.98rem;
        }
        .generation-status-card p {
            margin: 5px 0 0;
            color: var(--muted);
            font-size: 0.88rem;
            overflow-wrap: anywhere;
        }
        .generation-status-pill {
            display: inline-block;
            margin-right: 6px;
            padding: 2px 7px;
            border-radius: 999px;
            background: rgba(224, 255, 91, 0.14);
            color: var(--accent);
            font-size: 0.72rem;
            font-weight: 800;
            text-transform: uppercase;
        }
        .generation-status-card.is-pending .generation-status-pill {
            background: rgba(255, 191, 92, 0.14);
            color: #ffc15c;
        }
        .generation-status-card.is-interrupted .generation-status-pill {
            background: rgba(255, 127, 111, 0.14);
            color: #ff9f8d;
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
        .folder-picker-label {
            display: block;
            margin-top: 14px;
            color: var(--muted);
        }
        .folder-picker {
            width: 100%;
            margin-top: 6px;
            padding: 12px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            background: #17130c;
            color: var(--text);
            font: inherit;
        }
        .folder-picker option:disabled {
            color: #777;
        }
        .active-generation-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 12px 0 0;
            color: #c8f6a4;
            cursor: pointer;
        }
        .active-generation-toggle input { accent-color: #66dc79; }
        .active-generation-toggle-count { color: var(--muted); font-size: 0.9em; }
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
        .playback-controls button {
            padding: 10px 12px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.28);
            color: var(--text);
            font: inherit;
            cursor: pointer;
        }
        .playback-controls output {
            min-width: 2ch;
            color: var(--accent);
            font-weight: 700;
        }
        .film-kind-options {
            margin: 14px 0 0;
            padding: 12px 14px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            color: var(--muted);
        }
        .film-kind-options legend { padding: 0 6px; }
        .film-kind-options label {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            cursor: pointer;
        }
        .film-kind-options input { accent-color: var(--accent); }
        .iteration-options-details {
            margin: 10px 0 0;
            border: 1px solid rgba(133, 255, 153, 0.55);
            border-radius: 12px;
            background: rgba(42, 116, 57, 0.24);
        }
        .iteration-options-details > summary {
            padding: 10px 14px;
            color: #a9f5b2;
            cursor: pointer;
            font-weight: 700;
        }
        .iteration-options-details[open] > summary { border-bottom: 1px solid rgba(133, 255, 153, 0.3); }
        .iteration-options {
            margin: 0;
            padding: 12px 14px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
            border: 0;
            border-radius: 0 0 12px 12px;
            background: transparent;
            color: #d9f5dc;
        }
        .iteration-options[hidden] { display: none; }
        .iteration-options legend { padding: 0 6px; color: #a9f5b2; }
        .iteration-options-hint { flex: 1 0 100%; margin: 0; color: #d7d2c1; }
        .iteration-options label {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            cursor: pointer;
        }
        .iteration-options input { accent-color: #66dc79; }
        .iteration-selection-controls { flex: 1 0 100%; display: flex; gap: 8px; }
        .iteration-selection-controls button { padding: 7px 10px; }
        .iteration-options-history { flex: 1 0 100%; }
        .iteration-options-history > summary { color: #d7d2c1; cursor: pointer; font-weight: 700; }
        .iteration-options-history-content {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .iteration-options label.is-interrupted {
            color: #ffc17d;
            cursor: default;
        }
        .iteration-options label.is-interrupted input { accent-color: #ff9a45; }
        .iteration-options label.is-pending { color: #ffc15c; }
        .iteration-options label.is-pending input { accent-color: #ffc15c; }
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
        .audio-prompt {
            position: absolute;
            z-index: 5;
            left: 50%;
            bottom: 58px;
            transform: translateX(-50%);
            padding: 10px 16px;
            border: 1px solid rgba(255, 255, 255, 0.24);
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.72);
            color: var(--text);
            font-weight: 700;
            pointer-events: none;
            white-space: nowrap;
        }
        .audio-prompt[hidden] { display: none; }
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
            pointer-events: auto;
        }
        video:not(.is-active) {
            pointer-events: none;
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
        .playlist-panel {
            margin-top: 14px;
            padding: 14px 18px;
            background: var(--panel);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
        }
        .playlist-panel h2 {
            margin: 0 0 10px;
            font-size: 1rem;
        }
        .playlist-panel h2 span { color: var(--accent); }
        .playlist-items {
            display: grid;
            gap: 6px;
            max-height: 280px;
            overflow: auto;
            margin: 0;
            padding-left: 28px;
        }
        .playlist-items button {
            width: 100%;
            padding: 8px 10px;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: var(--text);
            text-align: left;
            font: inherit;
            cursor: pointer;
        }
        .playlist-items button:hover,
        .playlist-items button[aria-current="true"] {
            background: rgba(224, 255, 91, 0.14);
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
    <script>if (new URLSearchParams(location.search).get('kiosk') === '1') document.body.classList.add('kiosk-mode');</script>
    <div class="page">
        <section class="meta">
            <h1>Continuous Folder Video Player</h1>
            <p>Folder: <code>${escapeHtml(folderLabel)}</code></p>
            <label class="folder-picker-label" for="folder-picker">Available generations</label>
            <select id="folder-picker" class="folder-picker">
                <option value="">Loading folders…</option>
            </select>
            <form class="folder-form" action="/continuous-player" method="get">
                <input
                    type="text"
                    name="folder"
                    value="${escapeHtml(folderInputValue)}"
                    placeholder="lib/generator/.../parts"
                    spellcheck="false"
                    autocomplete="off"
                >
                <button type="submit">Open Folder</button>
            </form>
            <label class="active-generation-toggle" title="Ergänzt die ausgewählte Generation um Videos aus allen laufenden Generatorpfaden.">
                <input id="include-active-generations" type="checkbox" checked>
                <span>Aktive Runs in die Videoschleife aufnehmen</span>
                <span class="active-generation-toggle-count" id="active-generation-count"></span>
            </label>
            <div class="playback-controls">
                <button id="playback-toggle" type="button">Play</button>
                <button id="previous-clip" type="button">Previous</button>
                <button id="next-clip" type="button">Next</button>
                <label>
                    Loop
                    <select id="loop-mode">
                        <option value="all" selected>Entire selected list</option>
                        <option value="tail">Newest tail</option>
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
            <fieldset class="film-kind-options" id="film-kind-options">
                <legend>Film type · recursive</legend>
            </fieldset>
            <details class="iteration-options-details" id="iteration-options-details" hidden>
                <summary id="iteration-options-summary">Iterations to play</summary>
                <fieldset class="iteration-options" id="iteration-options" hidden>
                    <legend>Iterations to play</legend>
                </fieldset>
            </details>
        </section>

        <section class="generation-status-panel" aria-live="polite" aria-label="Live generation status">
            <div class="generation-status-heading">
                <h2>Aktuelle Generierungen</h2>
                <span class="generation-status-summary" id="generation-status-summary">Status wird geladen…</span>
            </div>
            <p class="generation-status-empty">Ein Run kann mehrere Scene-JSON-Worker parallel starten. „Medien ausstehend“ heißt: Iteration läuft, Videos fehlen noch. „Unterbrochen“ heißt: Worker-Prozess ist beendet; vorhandene Clips bleiben abspielbar.</p>
            <div class="generation-status-list" id="generation-status-list">
                <p class="generation-status-empty">Generierungsordner werden gesucht…</p>
            </div>
        </section>

        <section class="player-shell">
            <video id="video-a" muted playsinline preload="auto"></video>
            <video id="video-b" muted playsinline preload="auto"></video>
            <div class="player-overlay">
                <div class="player-overlay__count" id="video-count">0/0</div>
                <button class="player-overlay__button" id="fullscreen-toggle" type="button">Fullscreen</button>
            </div>
        </section>

        <div class="video-controls-toolbar">
            <button id="video-controls-toggle" type="button" aria-pressed="false">Video controls: off</button>
        </div>

        <section class="status">
            <div>Now playing: <strong id="now-playing">waiting for files</strong></div>
            <div>Buffered next: <strong id="next-playing">none</strong></div>
            <div>Folder files: <strong id="file-count">0</strong></div>
        </section>

        <p class="prompt"><strong>Prompt:</strong> <span id="video-prompt">waiting for prompt</span></p>
        <section class="playlist-panel" aria-label="Video playlist">
            <h2>Playlist <span id="playlist-count">0</span></h2>
            <ol id="playlist-items" class="playlist-items"></ol>
        </section>
        <p class="hint">Behavior: videos are found recursively in the selected folder. The player cycles through the selected film type in filename order, preloading the next clip before each transition. New files are picked up automatically.</p>
        <p class="error" id="player-error"></p>
    </div>

    <script>
        (() => {
            const folder = ${JSON.stringify(folder)};
            const initialError = ${JSON.stringify(initialError)};
            const getPlaylistUrl = () => '/continuous-video-api?folder=' + encodeURIComponent(folder)
                + (includeActiveGenerations ? '&includeActive=1' : '');
            const videos = [
                document.getElementById('video-a'),
                document.getElementById('video-b'),
            ];
            const videoControlsToggleEl = document.getElementById('video-controls-toggle');
            const videoControlsPreferenceKey = 'continuous-player-video-controls';
            let videoControlsEnabled = false;
            try {
                videoControlsEnabled = window.localStorage.getItem(videoControlsPreferenceKey) === 'on';
            } catch {
                // Video controls remain available for this page session when storage is unavailable.
            }
            const syncVideoControls = () => {
                videos.forEach((video) => {
                    video.controls = videoControlsEnabled;
                });
                videoControlsToggleEl.textContent = 'Video controls: ' + (videoControlsEnabled ? 'on' : 'off');
                videoControlsToggleEl.setAttribute('aria-pressed', String(videoControlsEnabled));
            };
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
            const folderPickerEl = document.getElementById('folder-picker');
            const includeActiveGenerationsEl = document.getElementById('include-active-generations');
            const activeGenerationCountEl = document.getElementById('active-generation-count');
            const activeGenerationPreferenceKey = 'continuous-player-include-active-generations';
            try {
                const savedPreference = window.localStorage.getItem(activeGenerationPreferenceKey);
                includeActiveGenerationsEl.checked = savedPreference === null || savedPreference === 'on';
            } catch {
                includeActiveGenerationsEl.checked = true;
            }
            const playlistItemsEl = document.getElementById('playlist-items');
            const playlistCountEl = document.getElementById('playlist-count');
            const previousClipEl = document.getElementById('previous-clip');
            const nextClipEl = document.getElementById('next-clip');
            const playbackToggleEl = document.getElementById('playback-toggle');
            const filmKindOptionsEl = document.getElementById('film-kind-options');
            const iterationOptionsDetailsEl = document.getElementById('iteration-options-details');
            const iterationOptionsSummaryEl = document.getElementById('iteration-options-summary');
            const iterationOptionsEl = document.getElementById('iteration-options');
            const generationStatusSummaryEl = document.getElementById('generation-status-summary');
            const generationStatusListEl = document.getElementById('generation-status-list');

            let playlist = [];
            let allPlaylistFiles = [];
            let selectedFilmKind = '';
            let renderedFilmKindSignature = '';
            let activeIterationFolders = [];
            let includeActiveGenerations = includeActiveGenerationsEl.checked;
            let selectedIterationNumbers = new Set();
            let knownIterationNumbers = new Set();
            let knownIterationStatuses = new Map();
            let iterationSelectionInitialized = false;
            let renderedIterationSignature = '';
            let currentIndex = -1;
            let activeSlot = 0;
            let preloadedIndex = -1;
            let loadingIndex = -1;
            let transitionInFlight = false;
            let loopMode = 'all';
            let pingPongEnabled = false;
            let pingPongDirection = 1;
            let tailCount = 8;
            let fullscreenOverlayTimer = null;
            let preloadedDirection = 1;
            let latestFolderFileCount = 0;
            let playbackStartInFlight = false;
            let playbackRetryTimer = null;
            let tailRoundsCompleted = 0;
            let playAllRoundActive = false;
            let deactivateAllRoundAfterStep = false;
            let boundaryTransitionInFlight = false;
            let playerMuted = true;
            let playerVolume = 1;
            const failedClipIds = new Set();
            const crossfadeMs = 600;
            const handoffWindowSeconds = 0.8;
            const fullscreenOverlayIdleMs = 1600;
            const minimumClipAgeMs = 4000;
            const playAllEveryTailRounds = 10;

            const setError = (message) => {
                errorEl.textContent = message || '';
            };

            const setActiveGenerationMode = async (enabled) => {
                const modeChanged = includeActiveGenerations !== enabled;
                includeActiveGenerations = enabled;
                includeActiveGenerationsEl.checked = enabled;
                try {
                    window.localStorage.setItem(activeGenerationPreferenceKey, enabled ? 'on' : 'off');
                } catch {
                    // Playlist mode still works for this page session when storage is unavailable.
                }
                if (!modeChanged) return;

                const currentClipId = playlist[currentIndex]?.id;
                const wasPlaying = !videos[activeSlot].paused;
                await fetchPlaylist();
                if (currentClipId && playlist.some((item) => item.id === currentClipId)) {
                    if (wasPlaying) void preloadIndex(getNextStep());
                } else if (wasPlaying && playlist.length) {
                    currentIndex = -1;
                    await startPlayback();
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
                const maxTail = Math.max(1, playlist.length);
                tailCountEl.max = String(maxTail);
                if (tailCount > maxTail) {
                    tailCount = maxTail;
                }
                if (tailCount < 1) {
                    tailCount = 1;
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
                const size = Math.min(Math.max(1, tailCount), playlist.length);
                return {
                    start: Math.max(0, playlist.length - size),
                    end: playlist.length - 1,
                };
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
                    return { index: start, direction: 1 };
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

            const filmKindDefinitions = [
                { value: 'full-film', label: 'Full films' },
                { value: 'glued-film', label: 'Full films with transitions' },
                { value: 'iteration-film', label: 'Iteration films' },
                { value: 'iteration-title-card', label: 'Iterations with title card' },
                { value: 'title-card', label: 'Title cards' },
                { value: 'scene', label: 'Scene clips' },
                { value: 'bridge', label: 'Transition clips' },
                { value: 'other', label: 'Other videos' },
            ];

            const iterationFilmKinds = new Set([
                'iteration-film',
                'iteration-title-card',
                'title-card',
                'scene',
                'bridge',
            ]);

            const getIterationNumber = (item) => {
                const match = ((item.src || '') + '/' + (item.name || '')).match(/iteration-(\\d+)/i);
                return match?.[1] || '';
            };

            const getIterationKey = (item) => {
                let source = item.src || '';
                try {
                    source = decodeURI(source);
                } catch (error) {
                    // Keep original source if a filename contains malformed URI escapes.
                }
                source = source.replace(/^\\/continuous-video-file\\//, '');
                const match = source.match(/(.*?iteration-\\d+)(?:\\/|$)/i);
                return match?.[1] || '';
            };

            const generationStageLabels = {
                article_selection: 'Artikel wird ausgewählt',
                auto_director: 'Auto Director plant',
                story_planning: 'Szenen werden geplant',
                scene_timing: 'Szenen-Timing',
                image_generation: 'Bilderzeugung',
                video_vision: 'Videoanalyse',
                video_direction: 'Videoregie',
                video_generation: 'Videogenerierung',
                audio_direction: 'Audioplanung',
                finalizing: 'Iteration wird abgeschlossen',
                film_assembly: 'Film wird montiert',
                iteration_finalizing: 'Iteration wird abgeschlossen',
            };

            const renderGenerationStatus = (folders) => {
                const cards = folders.filter((folder) => (
                    folder.runnerActive
                    || folder.activeIterations.some((iteration) => iteration.status === 'running')
                    || folder.activeIterations.some((iteration) => iteration.status === 'pending_media')
                    || folder.activeIterations.some((iteration) => iteration.status === 'interrupted')
                    || (folder.runStatus === 'pending_media' && folder.pendingVideoCount > 0)
                ));
                const isVisibleRun = (folder) => folder.runnerActive
                    || folder.activeIterations.some((iteration) => iteration.status === 'running');
                const hasPendingMedia = (folder) => folder.activeIterations.some((iteration) => iteration.status === 'pending_media')
                    || (folder.runStatus === 'pending_media' && folder.pendingVideoCount > 0);
                const runningCards = cards.filter(isVisibleRun);
                const pendingCards = cards.filter(hasPendingMedia);
                const interruptedCards = cards.filter((folder) => !isVisibleRun(folder) && !hasPendingMedia(folder));
                const pendingCount = pendingCards.reduce((count, folder) => count
                    + folder.activeIterations.filter((iteration) => iteration.status === 'pending_media').length, 0);
                const pendingVideoCount = pendingCards.reduce((count, folder) => count
                    + folder.activeIterations
                        .filter((iteration) => iteration.status === 'pending_media')
                        .reduce((iterationCount, iteration) => iterationCount + (iteration.videoPendingCount || 0), 0), 0);
                generationStatusSummaryEl.textContent = runningCards.length || pendingCards.length
                    ? [
                        runningCards.length ? runningCards.length + ' Runs aktiv' : '',
                        pendingCount ? pendingCount + ' Iterationen warten auf Videos/Medien' : '',
                    ].filter(Boolean).join(' · ') || 'Keine aktive Generierung'
                    : 'Keine laufenden oder wartenden Runs';

                const fragment = document.createDocumentFragment();
                if (!runningCards.length) {
                    const empty = document.createElement('p');
                    empty.className = 'generation-status-empty';
                    empty.textContent = 'Aktuell läuft kein Generator.';
                    fragment.append(empty);
                }
                const appendCard = (folder, target, statusOverride, iterationStatus) => {
                    const iterations = [...(folder.activeIterations || [])].sort((left, right) => (
                        (left.status === 'running' ? -1 : 0) - (right.status === 'running' ? -1 : 0)
                            || Number(right.iteration) - Number(left.iteration)
                    ));
                    const visibleIterations = iterationStatus
                        ? iterations.filter((iteration) => iteration.status === iterationStatus)
                        : iterations;
                    const status = statusOverride || (folder.runnerActive || visibleIterations.some((iteration) => iteration.status === 'running')
                        ? 'running'
                        : visibleIterations.some((iteration) => iteration.status === 'pending_media')
                            || (folder.runStatus === 'pending_media' && folder.pendingVideoCount > 0)
                            ? 'pending_media' : 'interrupted');
                    const card = document.createElement('article');
                    card.className = 'generation-status-card ' + (
                        status === 'running' ? 'is-running' : status === 'pending_media' ? 'is-pending' : 'is-interrupted'
                    );
                    const heading = document.createElement('h3');
                    const pill = document.createElement('span');
                    pill.className = 'generation-status-pill';
                    pill.textContent = status === 'running'
                        ? 'läuft'
                        : status === 'pending_media' ? 'Medien ausstehend' : 'unterbrochen';
                    heading.append(pill, document.createTextNode(folder.path));
                    card.append(heading);

                    const addLine = (text) => {
                        const line = document.createElement('p');
                        line.textContent = text;
                        card.append(line);
                    };
                    addLine([folder.autoMode ? 'Auto Mode' : 'Manueller Lauf', folder.profile, ...(folder.iteratorNames || [])]
                        .filter(Boolean).join(' · '));
                    if (folder.iteratorNames?.length > 1) {
                        addLine(folder.iteratorNames.length + ' parallele Scene-JSON-Worker: ' + folder.iteratorNames.join(', '));
                    }
                    if (status === 'running' && folder.runnerActive && !visibleIterations.some((iteration) => iteration.status === 'running')) {
                        const nextStartAt = folder.nextStartAtMs ? new Date(folder.nextStartAtMs) : null;
                        addLine(nextStartAt && nextStartAt.getTime() > Date.now()
                            ? 'Exhibition Runner aktiv · nächster Start ' + nextStartAt.toLocaleTimeString()
                            : 'Exhibition Runner aktiv · wartet auf den nächsten Schritt');
                    }
                    if (visibleIterations.length) {
                        visibleIterations.slice(0, 5).forEach((iteration) => {
                            const stageLabel = generationStageLabels[iteration.stage] || iteration.stage || 'Status wird ermittelt';
                            const stateLabel = iteration.status === 'pending_media' ? ' · wartet auf Videos/Medien'
                                : iteration.status === 'interrupted' ? ' · unterbrochen' : '';
                            addLine('Iteration ' + iteration.iteration + ' · ' + stageLabel + stateLabel);
                            if (iteration.articleTitle) addLine('Artikel: ' + iteration.articleTitle);
                            if (iteration.sceneCount) {
                                addLine('Bilder: ' + iteration.imageReadyCount + '/' + iteration.sceneCount
                                    + ' · Videos: ' + iteration.videoReadyCount + '/' + iteration.videoExpectedCount
                                    + (iteration.videoPendingCount ? ' · ' + iteration.videoPendingCount + ' ausstehend' : ''));
                            }
                            if (iteration.error) addLine('Fehler: ' + iteration.error);
                        });
                        if (visibleIterations.length > 5) addLine('… und ' + (visibleIterations.length - 5) + ' weitere Iterationen');
                    } else if (folder.runnerActive) {
                        const nextStartAt = folder.nextStartAtMs ? new Date(folder.nextStartAtMs) : null;
                        addLine(nextStartAt && nextStartAt.getTime() > Date.now()
                            ? 'Runner aktiv · nächster Start ' + nextStartAt.toLocaleTimeString()
                            : 'Runner aktiv · wartet auf den nächsten Schritt');
                    }
                    target.append(card);
                };
                runningCards.forEach((folder) => appendCard(folder, fragment, 'running', 'running'));

                if (pendingCards.length) {
                    const pendingDetails = document.createElement('details');
                    pendingDetails.className = 'generation-status-history';
                    const pendingSummary = document.createElement('summary');
                    pendingSummary.textContent = [
                        'Medien ausstehend · ' + pendingCards.length + ' Runs',
                        pendingCount ? pendingCount + ' Iterationen' : '',
                        pendingVideoCount ? pendingVideoCount + ' Videos/Medien' : '',
                    ].filter(Boolean).join(' · ');
                    const pendingList = document.createElement('div');
                    pendingList.className = 'generation-status-list';
                    pendingCards.forEach((folder) => appendCard(folder, pendingList, 'pending_media', 'pending_media'));
                    pendingDetails.append(pendingSummary, pendingList);
                    fragment.append(pendingDetails);
                }

                if (interruptedCards.length) {
                    const interruptedDetails = document.createElement('details');
                    interruptedDetails.className = 'generation-status-history';
                    const interruptedSummary = document.createElement('summary');
                    const interruptedCount = interruptedCards.reduce((count, folder) => count
                        + folder.activeIterations.filter((iteration) => iteration.status === 'interrupted').length, 0);
                    interruptedSummary.textContent = [
                        'Abgebrochene Runs · ' + interruptedCards.length,
                        interruptedCount ? interruptedCount + ' Iterationen' : '',
                    ].filter(Boolean).join(' · ');
                    const interruptedList = document.createElement('div');
                    interruptedList.className = 'generation-status-list';
                    interruptedCards.forEach((folder) => appendCard(folder, interruptedList, 'interrupted', 'interrupted'));
                    interruptedDetails.append(interruptedSummary, interruptedList);
                    fragment.append(interruptedDetails);
                }
                generationStatusListEl.replaceChildren(fragment);
            };

            const getUnfilteredFilesForFilmKind = (kind) => {
                const files = allPlaylistFiles.filter((item) => item.kind === kind);
                const normalizedFileNames = new Set(files
                    .filter((item) => /-audio-normalized\.mp4$/i.test(item.name))
                    .map((item) => item.src.replace(/-audio-normalized\.mp4$/i, '.mp4')));

                return files.filter((item) => (
                    /-audio-normalized\.mp4$/i.test(item.name)
                    || !normalizedFileNames.has(item.src)
                ));
            };

            const getFilesForFilmKind = (kind) => {
                const files = getUnfilteredFilesForFilmKind(kind);
                if (folder === ${JSON.stringify(exhibitionCampaignKey)}) return files;
                if (!iterationFilmKinds.has(kind) || !iterationSelectionInitialized) {
                    return files;
                }
                return files.filter((item) => {
                    const iterationKey = getIterationKey(item);
                    return !iterationKey || selectedIterationNumbers.has(iterationKey);
                });
            };

            const renderIterationOptions = () => {
                const groups = new Map();
                activeIterationFolders.forEach(({ iteration, folder, run, status }) => {
                    const key = run + '/' + folder;
                    const existing = groups.get(key) || { iteration, run, count: 0, folders: new Set(), status: null };
                    existing.folders.add(key);
                    if (status === 'running') existing.status = 'running';
                    else if (status === 'pending_media' && existing.status !== 'running') existing.status = 'pending_media';
                    else if (status === 'interrupted' && existing.status === null) existing.status = 'interrupted';
                    groups.set(key, existing);
                });
                allPlaylistFiles.forEach((item) => {
                    const iterationNumber = getIterationNumber(item);
                    const key = getIterationKey(item);
                    if (!iterationNumber || !key) return;
                    const iterationDirectoryEnd = key.toLowerCase().lastIndexOf('/iteration-');
                    const run = iterationDirectoryEnd >= 0 ? key.slice(0, iterationDirectoryEnd) : '';
                    const existing = groups.get(key) || {
                        iteration: iterationNumber,
                        run,
                        count: 0,
                        folders: new Set(),
                        status: 'completed',
                    };
                    existing.run ||= run;
                    existing.folders.add(key);
                    existing.count += 1;
                    groups.set(key, existing);
                });

                const iterations = [...groups.entries()].sort(([, left], [, right]) => (
                    Number(left.iteration) - Number(right.iteration)
                ));
                const currentIterations = iterations.filter(([, group]) => group.status !== 'interrupted');
                const otherIterations = iterations.filter(([, group]) => group.status === 'interrupted');
                if (!iterations.length) {
                    iterationOptionsDetailsEl.hidden = true;
                    iterationOptionsEl.hidden = true;
                    iterationOptionsEl.replaceChildren(document.createElement('legend'));
                    iterationOptionsEl.querySelector('legend').textContent = 'Iterations to play';
                    renderedIterationSignature = '';
                    return;
                }

                if (!iterationSelectionInitialized) {
                    iterations.forEach(([iterationKey, group]) => {
                        if (group.status !== 'interrupted' && (group.count > 0 || group.status === 'running')) {
                            selectedIterationNumbers.add(iterationKey);
                        }
                    });
                    iterationSelectionInitialized = true;
                }
                iterations.forEach(([iterationKey, group]) => {
                    if (group.status === 'interrupted') selectedIterationNumbers.delete(iterationKey);
                    if (!knownIterationNumbers.has(iterationKey)) {
                        if (group.status !== 'interrupted' && (group.count > 0 || group.status === 'running')) {
                            selectedIterationNumbers.add(iterationKey);
                        }
                        knownIterationNumbers.add(iterationKey);
                    } else if (knownIterationStatuses.get(iterationKey) === 'running' && group.status === 'interrupted') {
                        selectedIterationNumbers.delete(iterationKey);
                    }
                    knownIterationStatuses.set(iterationKey, group.status);
                });

                iterationOptionsDetailsEl.hidden = false;
                iterationOptionsEl.hidden = false;
                const signature = JSON.stringify(iterations.map(([iterationKey, group]) => [
                    iterationKey,
                    group.count,
                    group.status,
                    [...group.folders].sort(),
                    selectedIterationNumbers.has(iterationKey),
                ]));
                if (signature === renderedIterationSignature) return;
                renderedIterationSignature = signature;

                const currentFragment = document.createDocumentFragment();
                const otherFragment = document.createDocumentFragment();
                const appendIterationOption = (target, [iterationKey, group]) => {
                    const optionLabel = document.createElement('label');
                    if (group.status === 'interrupted') optionLabel.classList.add('is-interrupted');
                    if (group.status === 'pending_media') optionLabel.classList.add('is-pending');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = iterationKey;
                    checkbox.checked = selectedIterationNumbers.has(iterationKey);
                    checkbox.addEventListener('change', async () => {
                        const currentClipId = playlist[currentIndex]?.id;
                        const wasPlaying = !videos[activeSlot].paused;
                        if (checkbox.checked) {
                            selectedIterationNumbers.add(iterationKey);
                        } else {
                            selectedIterationNumbers.delete(iterationKey);
                        }
                        renderedIterationSignature = '';
                        renderIterationOptions();
                        playlist = getFilesForFilmKind(selectedFilmKind);
                        currentIndex = currentClipId
                            ? playlist.findIndex((item) => item.id === currentClipId)
                            : -1;
                        preloadedIndex = -1;
                        loadingIndex = -1;

                        if (currentIndex >= 0) {
                            updateStatus();
                            if (wasPlaying) void preloadIndex(getNextStep());
                            return;
                        }

                        videos.forEach((video) => {
                            video.pause();
                            video.removeAttribute('src');
                            video.load();
                        });
                        currentIndex = -1;
                        updateStatus();
                        if (wasPlaying && playlist.length) await startPlayback();
                    });
                    const label = [...group.folders].sort().join(', ');
                    const availability = group.status === 'pending_media'
                        ? 'wartet auf Medien' + (group.count > 0 ? ' · ' + group.count + ' Clips' : '')
                        : group.status === 'interrupted'
                        ? 'abgebrochen' + (group.count > 0 ? ' · ' + group.count + ' Clips vorhanden' : '')
                        : group.status === 'completed'
                            ? 'fertig · ' + group.count + ' Clips'
                        : group.count > 0
                            ? 'wird erzeugt · ' + group.count + ' Clips'
                            : 'wird erzeugt · Videos folgen';
                    const iterationLabel = group.status === 'completed'
                        ? 'Iteration ' + group.iteration
                        : 'Iteration ' + group.iteration + ' · ' + label;
                    optionLabel.append(checkbox, document.createTextNode(iterationLabel + ' (' + availability + ')'));
                    target.append(optionLabel);
                };
                currentIterations.forEach((entry) => appendIterationOption(currentFragment, entry));
                if (otherIterations.length) {
                    const history = document.createElement('details');
                    history.className = 'iteration-options-history';
                    const summary = document.createElement('summary');
                    summary.textContent = 'Abgebrochene Iterationen · ' + otherIterations.length;
                    const historyList = document.createElement('div');
                    historyList.className = 'iteration-options-history-content';
                    otherIterations.forEach((entry) => appendIterationOption(otherFragment, entry));
                    historyList.append(otherFragment);
                    history.append(summary, historyList);
                    currentFragment.append(history);
                }

                const visibleRunPaths = new Set(currentIterations.map(([, group]) => group.run).filter(Boolean));
                const runningCount = activeIterationFolders.filter(({ status }) => status === 'running').length;
                const pendingCount = activeIterationFolders.filter(({ status }) => status === 'pending_media').length;
                const statusSummary = [
                    visibleRunPaths.size ? visibleRunPaths.size + ' Runs' : 'Ausgewählte Iterationen',
                    runningCount ? runningCount + ' laufen' : '',
                    pendingCount ? pendingCount + ' wartet auf Medien' : '',
                ].filter(Boolean).join(' · ');
                const legend = document.createElement('legend');
                legend.textContent = 'Iterations to play';
                iterationOptionsSummaryEl.textContent = statusSummary;
                const hint = document.createElement('p');
                hint.className = 'iteration-options-hint';
                hint.textContent = 'Häkchen wählen Iterationen für die Playlist. Danach Play drücken.';
                const controls = document.createElement('div');
                controls.className = 'iteration-selection-controls';
                const selectAllButton = document.createElement('button');
                selectAllButton.type = 'button';
                selectAllButton.textContent = 'Alle sichtbaren auswählen & abspielen';
                selectAllButton.addEventListener('click', async () => {
                    selectedIterationNumbers = new Set(currentIterations.map(([iterationKey]) => iterationKey));
                    renderedIterationSignature = '';
                    renderIterationOptions();
                    playlist = getFilesForFilmKind(selectedFilmKind);
                    currentIndex = -1;
                    preloadedIndex = -1;
                    videos.forEach((video) => {
                        video.pause();
                        video.removeAttribute('src');
                        video.load();
                    });
                    updateStatus();
                    if (playlist.length) await startPlayback();
                    else setError('Keine Clips in den ausgewählten Iterationen für diesen Filmtyp.');
                });
                const clearSelectionButton = document.createElement('button');
                clearSelectionButton.type = 'button';
                clearSelectionButton.textContent = 'Auswahl aufheben';
                clearSelectionButton.addEventListener('click', () => {
                    selectedIterationNumbers.clear();
                    renderedIterationSignature = '';
                    renderIterationOptions();
                    playlist = getFilesForFilmKind(selectedFilmKind);
                    currentIndex = -1;
                    preloadedIndex = -1;
                    videos.forEach((video) => {
                        video.pause();
                        video.removeAttribute('src');
                        video.load();
                    });
                    updateStatus();
                    setError(playlist.length
                        ? 'Auswahl aufgehoben. Verbleibende Clips brauchen keine Iterationsauswahl.'
                        : 'Keine Iteration ausgewählt. Film bleibt leer.');
                });
                controls.append(selectAllButton, clearSelectionButton);
                iterationOptionsEl.replaceChildren(legend, hint, controls, currentFragment);
            };

            const renderFilmKindOptions = () => {
                const availableKinds = filmKindDefinitions
                    .map(({ value, label }) => ({
                        value,
                        label,
                        count: getUnfilteredFilesForFilmKind(value).length,
                    }));
                const signature = JSON.stringify({
                    availableKinds,
                    activeIterations: activeIterationFolders.map(({ run, folder, iteration }) => [run, folder, iteration]),
                });
                if (signature === renderedFilmKindSignature) return;
                renderedFilmKindSignature = signature;

                if (!availableKinds.some((option) => option.value === selectedFilmKind && option.count > 0)) {
                    selectedFilmKind = availableKinds.find((option) => option.value === 'iteration-title-card' && option.count > 0)?.value
                        || availableKinds.find((option) => option.count > 0)?.value
                        || (activeIterationFolders.length ? 'iteration-title-card' : '')
                        || '';
                }
                const fragment = document.createDocumentFragment();
                availableKinds.forEach(({ value, label, count }) => {
                    const optionLabel = document.createElement('label');
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = 'film-kind';
                    radio.value = value;
                    radio.checked = selectedFilmKind === value;
                    radio.disabled = count === 0;
                    radio.addEventListener('change', async () => {
                        selectedFilmKind = value;
                        renderedIterationSignature = '';
                        renderIterationOptions();
                        playlist = getFilesForFilmKind(value);
                        currentIndex = -1;
                        preloadedIndex = -1;
                        updateStatus();
                        if (playlist.length) await playSpecificClip(0);
                    });
                    optionLabel.append(radio, document.createTextNode(label + ' (' + count + ')'));
                    fragment.append(optionLabel);
                });
                filmKindOptionsEl.replaceChildren(document.createElement('legend'), fragment);
                filmKindOptionsEl.querySelector('legend').textContent = 'Film type · recursive';
                renderIterationOptions();
            };

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
                const activeVideo = videos[activeSlot];
                playbackToggleEl.textContent = activeVideo.paused ? 'Play' : 'Stop';
                playbackToggleEl.setAttribute('aria-pressed', String(!activeVideo.paused));
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
                playlistCountEl.textContent = String(playlist.length);
                const playlistFragment = document.createDocumentFragment();
                playlist.forEach((item, index) => {
                    const listItem = document.createElement('li');
                    const clipButton = document.createElement('button');
                    clipButton.type = 'button';
                    clipButton.textContent = item.name;
                    clipButton.setAttribute('aria-current', index === currentIndex ? 'true' : 'false');
                    clipButton.addEventListener('click', () => {
                        void playSpecificClip(index);
                    });
                    listItem.append(clipButton);
                    playlistFragment.append(listItem);
                });
                playlistItemsEl.replaceChildren(playlistFragment);
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
                if (!folder || !folder.trim()) {
                    playlist = [];
                    latestFolderFileCount = 0;
                    updateStatus();
                    return playlist;
                }
                const response = await fetch(getPlaylistUrl(), { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('Failed to load playlist');
                }
                const data = await response.json();
                latestFolderFileCount = data.count || 0;
                activeIterationFolders = data.activeIterations || [];
                allPlaylistFiles = getEligibleFiles(data.files || []);
                renderFilmKindOptions();
                renderIterationOptions();
                const nextPlaylist = getFilesForFilmKind(selectedFilmKind);
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
                    currentIndex = Math.max(0, getLoopRange().start);
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

            const playVideo = async (video, { muted = playerMuted } = {}) => {
                try {
                    video.muted = muted;
                    video.volume = playerVolume;
                    video.playsInline = true;
                    const playResult = video.play();
                    if (playResult && typeof playResult.then === 'function') {
                        await playResult;
                    }
                    setError('');
                    return true;
                } catch (error) {
                    if (!muted && error.name === 'NotAllowedError') {
                        playerMuted = true;
                        video.muted = true;
                        try {
                            const mutedPlayResult = video.play();
                            if (mutedPlayResult && typeof mutedPlayResult.then === 'function') {
                                await mutedPlayResult;
                            }
                            return true;
                        } catch (mutedError) {
                            console.warn('Muted playback failed after audio autoplay was blocked', mutedError);
                        }
                    }
                    setError('Autoplay blocked or playback failed. Use the player controls to retry.');
                    console.warn('Playback failed', error);
                    return false;
                }
            };

            const waitForVideoFrame = (video) => new Promise((resolve) => {
                if (typeof video.requestVideoFrameCallback !== 'function') {
                    resolve();
                    return;
                }
                let settled = false;
                let timeoutId;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(timeoutId);
                    resolve();
                };
                timeoutId = window.setTimeout(finish, 350);
                video.requestVideoFrameCallback(finish);
            });

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
                hiddenVideo.muted = true;
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

                nextVideo.currentTime = 0;
                nextVideo.muted = true;
                const started = await playVideo(nextVideo, { muted: true });
                if (!started) {
                    const hasMore = markClipFailed(preloadedIndex, 'Playback failed after preload');
                    transitionInFlight = false;
                    if (hasMore) {
                        await preloadIndex(getNextStep());
                    } else {
                        setError('No browser-playable clips available yet. Waiting for the next stable file.');
                    }
                    return;
                }

                await waitForVideoFrame(nextVideo);

                nextVideo.classList.add('is-active');
                nextVideo.style.opacity = '1';
                currentVideo.style.opacity = '0';

                window.setTimeout(() => {
                    void completeTransitionToSlot(nextSlot);
                }, crossfadeMs);
                return true;
            };

            const playSpecificClip = async (index) => {
                if (
                    index < 0
                    || index >= playlist.length
                    || index === currentIndex
                    || transitionInFlight
                    || boundaryTransitionInFlight
                ) {
                    return false;
                }

                const hiddenSlot = activeSlot === 0 ? 1 : 0;
                const hiddenVideo = videos[hiddenSlot];
                const item = playlist[index];
                loadingIndex = index;
                preloadedIndex = -1;
                hiddenVideo.pause();
                hiddenVideo.muted = true;
                hiddenVideo.removeAttribute('src');
                hiddenVideo.load();
                hiddenVideo.src = item.src + '?t=' + encodeURIComponent(String(item.mtimeMs));
                hiddenVideo.currentTime = 0;
                hiddenVideo.load();

                try {
                    await waitForCanPlay(hiddenVideo);
                    preloadedIndex = index;
                    preloadedDirection = pingPongDirection;
                    updateStatus();
                    return await swapToPreloaded();
                } catch (error) {
                    markClipFailed(index, error.message);
                    setError('Could not play the selected clip. It was removed from the playlist.');
                    return false;
                } finally {
                    loadingIndex = -1;
                }
            };

            const loadAvailableFolders = async () => {
                try {
                    const response = await fetch('/continuous-video-folders-api', { cache: 'no-store' });
                    if (!response.ok) throw new Error('Folder list request failed');
                    const folders = await response.json();
                    renderGenerationStatus(folders);
                    const activePathCount = folders.filter((item) => item.runnerActive
                        || item.activeIterationCount > 0
                        || item.pendingVideoCount > 0).length;
                    activeGenerationCountEl.textContent = activePathCount
                        ? '· ' + activePathCount + ' aktiv'
                        : '· keine aktiven Runs';
                    folderPickerEl.replaceChildren();
                    folderPickerEl.disabled = false;
                    const hasPlayableOrActiveFolders = folders.some((item) => item.videoCount > 0 || item.iterationCount > 0);
                    const allOption = new Option('All generations', ${JSON.stringify(allContinuousGenerationsKey)});
                    allOption.disabled = !hasPlayableOrActiveFolders;
                    folderPickerEl.add(allOption);
                    const latestFolder = folders.find((item) => item.videoCount > 0);
                    const latestLabel = latestFolder
                        ? 'Latest generation · ' + new Date(latestFolder.latestVideoMtimeMs).toLocaleString() + ' · ' + latestFolder.path
                        : 'Latest generation (no videos found)';
                    const latestOption = new Option(latestLabel, ${JSON.stringify(latestContinuousGenerationKey)});
                    latestOption.disabled = !latestFolder;
                    folderPickerEl.add(latestOption);
                    folders.forEach((item) => {
                        const availabilityParts = [];
                        if (item.videoCount > 0) availabilityParts.push(item.videoCount + ' videos');
                        if (item.runnerActive) availabilityParts.push('runner aktiv');
                        else if (item.activeIterationCount > 0) availabilityParts.push(item.activeIterationCount + ' running');
                        if (item.interruptedIterationCount > 0) availabilityParts.push(item.interruptedIterationCount + ' interrupted');
                        const availability = availabilityParts.join(' · ') || 'empty · no videos';
                        const current = item.path === folder ? ' (current)' : '';
                        const option = new Option(item.path + ' (' + availability + ')' + current, item.path);
                        option.disabled = item.disabled;
                        folderPickerEl.add(option);
                    });
                    const specialFolders = [${JSON.stringify(allContinuousGenerationsKey)}, ${JSON.stringify(latestContinuousGenerationKey)}];
                    if (folder && !specialFolders.includes(folder) && !folders.some((item) => item.path === folder)) {
                        folderPickerEl.add(new Option(${JSON.stringify(folderLabel)} + ' (current)', folder));
                    }
                    folderPickerEl.value = folder;
                } catch (error) {
                    generationStatusSummaryEl.textContent = 'Status nicht verfügbar';
                    generationStatusListEl.replaceChildren();
                    const errorLine = document.createElement('p');
                    errorLine.className = 'generation-status-empty';
                    errorLine.textContent = 'Generierungsstatus konnte nicht geladen werden.';
                    generationStatusListEl.append(errorLine);
                    folderPickerEl.replaceChildren(new Option('Folder list unavailable', ''));
                    folderPickerEl.disabled = true;
                    console.warn('Could not load generation folders', error);
                }
            };

            const handleBoundaryTransition = async ({ index, allowRestartCurrent = false } = {}) => {
                if (index !== activeSlot || transitionInFlight || boundaryTransitionInFlight) {
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

            const startPlayback = async () => {
                if (playbackStartInFlight) return;
                playbackStartInFlight = true;
                if (playbackRetryTimer) {
                    window.clearTimeout(playbackRetryTimer);
                    playbackRetryTimer = null;
                }
                if (initialError) {
                    setError(initialError);
                }
                if (!folder || !folder.trim()) {
                    updateStatus();
                    playbackStartInFlight = false;
                    return;
                }
                try {
                    await fetchPlaylist();
                    if (!playlist.length) {
                        if (!playbackRetryTimer) {
                            playbackRetryTimer = window.setTimeout(() => {
                                playbackRetryTimer = null;
                                void startPlayback();
                            }, 1500);
                        }
                        return;
                    }

                    pingPongDirection = 1;
                    preloadedDirection = 1;
                    currentIndex = Math.max(0, getLoopRange().start);

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
                    if (!playbackRetryTimer) {
                        playbackRetryTimer = window.setTimeout(() => {
                            playbackRetryTimer = null;
                            void startPlayback();
                        }, 1500);
                    }
                } finally {
                    playbackStartInFlight = false;
                }
            };

            videos.forEach((video, index) => {
                video.addEventListener('click', (event) => {
                    if (index !== activeSlot || event.offsetY >= video.clientHeight - 56) {
                        return;
                    }
                    if (video.paused) {
                        void playVideo(video);
                    } else {
                        video.pause();
                    }
                });

                video.addEventListener('timeupdate', async () => {
                    if (
                        index !== activeSlot
                        || transitionInFlight
                        || boundaryTransitionInFlight
                        || !Number.isFinite(video.duration)
                    ) {
                        return;
                    }
                    const remaining = video.duration - video.currentTime;
                    if (remaining > handoffWindowSeconds) {
                        return;
                    }
                    await handleBoundaryTransition({ index, allowRestartCurrent: false });
                });

                video.addEventListener('ended', async () => {
                    if (index !== activeSlot) {
                        return;
                    }
                    await handleBoundaryTransition({ index, allowRestartCurrent: true });
                });
            });

            window.setInterval(async () => {
                try {
                    await fetchPlaylist();
                    await preloadIndex(getNextStep());
                } catch (error) {
                    setError('Playlist refresh failed. Check that the folder still exists.');
                    console.warn('Playlist refresh failed', error);
                }
            }, 2000);

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

            videoControlsToggleEl.addEventListener('click', () => {
                videoControlsEnabled = !videoControlsEnabled;
                syncVideoControls();
                try {
                    window.localStorage.setItem(videoControlsPreferenceKey, videoControlsEnabled ? 'on' : 'off');
                } catch {
                    // The toggle still applies until this page closes.
                }
            });

            folderPickerEl.addEventListener('change', () => {
                if (folderPickerEl.value) {
                    window.location.href = '/continuous-player?folder=' + encodeURIComponent(folderPickerEl.value);
                }
            });

            includeActiveGenerationsEl.addEventListener('change', async () => {
                try {
                    await setActiveGenerationMode(includeActiveGenerationsEl.checked);
                } catch (error) {
                    setError('Aktive Runs konnten nicht in die Playlist geladen werden.');
                    console.warn('Could not refresh playlist with active runs', error);
                }
            });

            previousClipEl.addEventListener('click', () => {
                if (!playlist.length) return;
                const previousIndex = (currentIndex - 1 + playlist.length) % playlist.length;
                void playSpecificClip(previousIndex);
            });

            playbackToggleEl.addEventListener('click', () => {
                const activeVideo = videos[activeSlot];
                if (activeVideo.paused) {
                    if (activeVideo.hasAttribute('src')) {
                        void playVideo(activeVideo);
                    } else {
                        void startPlayback();
                    }
                } else {
                    activeVideo.pause();
                    activeVideo.currentTime = 0;
                }
                updateStatus();
            });

            nextClipEl.addEventListener('click', () => {
                if (!playlist.length) return;
                const nextIndex = (currentIndex + 1) % playlist.length;
                void playSpecificClip(nextIndex);
            });

            videos.forEach((video, index) => {
                video.addEventListener('play', updateStatus);
                video.addEventListener('pause', updateStatus);

                video.addEventListener('volumechange', () => {
                    if (index !== activeSlot) return;
                    playerMuted = video.muted;
                    playerVolume = video.volume;
                });
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
            updateAudioButton();
            syncVideoControls();
            syncFullscreenButton();
            void loadAvailableFolders();
            window.setInterval(() => void loadAvailableFolders(), 6000);

            startPlayback().catch((error) => {
                setError('Initial playback failed. Press play on the controls or verify the folder path.');
                console.warn('Initial playback failed', error);
            });
        })();
    </script>
</body>
</html>`;
};

/**
 * API Routes
 */
const routes = {
    "/continuous-player": async (req, res) => {
        const requestedFolder = typeof req.query.folder === "string" ? req.query.folder : "";
        try {
            const folder = requestedFolder.trim()
                ? requestedFolder
                : getNewestContinuousPartsFolder();
            if (folder.trim()
                && folder !== allContinuousGenerationsKey
                && folder !== latestContinuousGenerationKey
                && folder !== exhibitionCampaignKey) {
                getContinuousFolderPath(folder);
            }
            res.set("content-type", "text/html");
            res.send(renderContinuousVideoPage(folder));
        } catch (error) {
            res.set("content-type", "text/html");
            res.send(renderContinuousVideoPage(requestedFolder, error.message));
        }
    },

    "/continuous-video": async (req, res) => {
        const query = new URLSearchParams();
        if (typeof req.query.folder === "string" && req.query.folder.trim()) {
            query.set("folder", req.query.folder);
        }
        const suffix = query.toString() ? `?${query.toString()}` : "";
        res.redirect(302, `/continuous-player${suffix}`);
    },

    "/continuous-video-folders-api": async (req, res) => {
        try {
            res.json(getContinuousMediaFolders());
        } catch (error) {
            res.status(500).json({ error: "Failed to read generation folders" });
        }
    },

    "/continuous-video-api": async (req, res) => {
        try {
            const includeActiveGenerations = ["1", "true"].includes(String(req.query.includeActive || "").toLowerCase());
            res.json(getContinuousVideoFiles(req.query.folder, includeActiveGenerations));
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    },

    "/continuous-video-file/*": async (req, res) => {
        try {
            const relativeFilePath = decodeURIComponent(req.params[0]);
            const folderReference = path.posix.dirname(relativeFilePath);
            const fileName = path.posix.basename(relativeFilePath);
            const { absolutePath: folderAbsolutePath } = getContinuousFolderPath(folderReference);
            const absoluteFilePath = path.resolve(folderAbsolutePath, fileName);
            const extension = path.extname(fileName).toLowerCase();

            if (
                !isPathWithin(folderAbsolutePath, absoluteFilePath) ||
                !fs.existsSync(absoluteFilePath) ||
                !fs.statSync(absoluteFilePath).isFile() ||
                ![".mp4", ".webm", ".mov"].includes(extension)
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
