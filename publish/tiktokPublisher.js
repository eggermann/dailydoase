// tiktokPublisher.js  (Node 18+; ESM)
// npm i axios dotenv
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
/**
 * Unified TikTok uploader supporting DRAFT (Inbox) and DIRECT POST.
 *
 * @param {string|null} videoPath - Local file path (required for FILE_UPLOAD).
 *                                  Use null when mode uses PULL_FROM_URL.
 * @param {object} opts
 * @param {"draft"|"direct"} [opts.mode="draft"]  - Draft (Inbox) or Direct Post.
 *
 * Auth:
 * @param {string} [opts.clientKey=process.env.CLIENT_KEY]
 * @param {string} [opts.clientSecret=process.env.CLIENT_SECRET]
 * @param {string} [opts.redirectUri=process.env.REDIRECT_URI]
 * @param {string} [opts.authCode=process.env.AUTH_CODE]        // one-time code
 * @param {string} [opts.accessToken=process.env.ACCESS_TOKEN]  // act.xxx
 * @param {string} [opts.refreshToken=process.env.REFRESH_TOKEN]// rft.xxx
 *
 * Media source:
 * @param {"FILE_UPLOAD"|"PULL_FROM_URL"} [opts.source="FILE_UPLOAD"]
 * @param {string} [opts.videoUrl] // required for PULL_FROM_URL (verified domain)
 * @param {number} [opts.chunkSize=8*1024*1024]
 * @param {string} [opts.contentType="video/mp4"]
 *
 * Metadata:
 * // Available in BOTH modes (caption):
 * @param {string} [opts.title] // caption (a.k.a. post_info.title)
 *
 * // DIRECT-ONLY fields (ignored by draft endpoint):
 * @param {"PUBLIC_TO_EVERYONE"|"MUTUAL_FOLLOW_FRIENDS"|"SELF_ONLY"} [opts.privacyLevel]
 * @param {boolean} [opts.disableDuet]
 * @param {boolean} [opts.disableStitch]
 * @param {boolean} [opts.disableComment]
 * @param {number}  [opts.videoCoverTimestampMs]
 * @param {boolean} [opts.brandContentToggle]
 * @param {boolean} [opts.brandOrganicToggle]
 * @param {boolean} [opts.isAIGC] // mark content as AI-generated
 *
 * Behavior:
 * @param {boolean} [opts.pollStatus=true]
 *
 * @returns {Promise<{publishId:string, status?:any, tokens?:{accessToken:string, refreshToken?:string}}>}
 */

export async function publishToTikTok(videoPath, opts = {}) {


  const {
    mode = "draft",
    clientKey = process.env.CLIENT_KEY,
    clientSecret = process.env.CLIENT_SECRET,
    redirectUri = process.env.REDIRECT_URI,
    authCode = process.env.AUTH_CODE,
    accessToken: initialAccess = process.env.ACCESS_TOKEN,
    refreshToken: initialRefresh = process.env.REFRESH_TOKEN,

    source = "FILE_UPLOAD",
    videoUrl,
    chunkSize = 8 * 1024 * 1024,
    contentType = "video/mp4",

    title,
    privacyLevel,
    disableDuet,
    disableStitch,
    disableComment,
    videoCoverTimestampMs,
    brandContentToggle,
    brandOrganicToggle,
    isAIGC,

    pollStatus = true,
  } = opts;

  if (!clientKey || !clientSecret) throw new Error("clientKey/clientSecret are required.");

  // --- OAuth helpers (v2) ---
  async function tokenExchange(body) {
    const { data } = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams(body),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    if (!data?.access_token) throw new Error("OAuth token request failed.");
    return data;
  }

  let accessToken = initialAccess;
  let refreshToken = initialRefresh;

  if (!accessToken) {
    if (authCode) {
      const t = await tokenExchange({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
      });
      accessToken = t.access_token;
      refreshToken = t.refresh_token;
    } else if (refreshToken) {
      const t = await tokenExchange({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      accessToken = t.access_token;
      refreshToken = t.refresh_token;
    } else {
      throw new Error("No access token. Provide authCode or refreshToken.");
    }
  }

  // --- (Direct mode) fetch creator options (privacy, toggles) if desired ---
  // This is recommended by TikTok so you only show allowed settings in your UI.
  // Endpoint: /v2/post/publish/creator_info/query/ (scope: video.publish)
  async function queryCreatorInfo() {
    const { data } = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        validateStatus: () => true,
      }
    );
    return data;
  }

  if (mode === "direct") {
    // Optional sanity call; you might use it in your app UI to populate options.
    try { await queryCreatorInfo(); } catch (_) { }
  }

  // --- Build post_info ---
  const post_info = {};
  if (title) post_info.title = title;

  if (mode === "direct") {
    // Only Direct Post supports these fields per TikTok docs
    if (privacyLevel) post_info.privacy_level = privacyLevel;
    if (typeof disableDuet === "boolean") post_info.disable_duet = disableDuet;
    if (typeof disableStitch === "boolean") post_info.disable_stitch = disableStitch;
    if (typeof disableComment === "boolean") post_info.disable_comment = disableComment;
    if (typeof videoCoverTimestampMs === "number") post_info.video_cover_timestamp_ms = videoCoverTimestampMs;
    if (typeof brandContentToggle === "boolean") post_info.brand_content_toggle = brandContentToggle;
    if (typeof brandOrganicToggle === "boolean") post_info.brand_organic_toggle = brandOrganicToggle;
    if (typeof isAIGC === "boolean") post_info.is_aigc = isAIGC;
  }

  // --- Build source_info ---
  const source_info =
    source === "PULL_FROM_URL"
      ? (() => {
        if (!videoUrl) throw new Error("videoUrl required for PULL_FROM_URL");
        // Note: URL must come from a verified domain/prefix for your app.
        return { source, video_url: videoUrl };
      })()
      : (() => {
        if (!videoPath) throw new Error("videoPath required for FILE_UPLOAD");
        const { size } = fs.statSync(videoPath);
        return {
          source,
          video_size: size,
          chunk_size: chunkSize,
          total_chunk_count: Math.ceil(size / chunkSize),
        };
      })();

  // --- Choose endpoint based on mode ---
  const endpoint =
    mode === "direct"
      ? "https://open.tiktokapis.com/v2/post/publish/video/init/"
      : "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";

  const initBody =
    Object.keys(post_info).length > 0
      ? { post_info, source_info }
      : { source_info };

  const initHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
  };

  // --- Init ---
  let initResp = await axios.post(endpoint, initBody, {
    headers: initHeaders,
    validateStatus: () => true,
  });

  // Retry once on token issues
  if (initResp?.data?.error?.code === "access_token_invalid" && refreshToken) {
    const t = await tokenExchange({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    accessToken = t.access_token;
    refreshToken = t.refresh_token;
    initResp = await axios.post(endpoint, initBody, {
      headers: { ...initHeaders, Authorization: `Bearer ${accessToken}` },
    });
  }

  if (initResp?.data?.error?.code !== "ok") {
    const err = initResp?.data?.error;
    throw new Error(`Init failed: ${err?.code || initResp.status} ${err?.message || ""}`);
  }

  const { upload_url: uploadUrl, publish_id: publishId } = initResp.data.data || {};

  // --- Upload (FILE_UPLOAD only) ---
  if (source === "FILE_UPLOAD") {
    const { size } = fs.statSync(videoPath);
    const fd = fs.openSync(videoPath, "r");
    let offset = 0;

    try {
      while (offset < size) {
        const end = Math.min(offset + chunkSize, size);
        const length = end - offset;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, offset);

        await axios.put(uploadUrl, buffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": length,
            "Content-Range": `bytes ${offset}-${end - 1}/${size}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: (s) => s >= 200 && s < 300,
        });

        offset = end;
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  // --- Optional status poll ---
  let status;
  if (pollStatus) {
    const { data } = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );
    status = data;
  }

  return { publishId, status, tokens: { accessToken, refreshToken } };
}

export default publishToTikTok;