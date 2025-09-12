// demo-direct.js
import publishToTikTok from "./tiktokPublisher.js";
import "dotenv/config";

const path = "/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS/v_2-1055-GodSportAcid/1752870043810-veo3-video-with-audio.mp4"; // Path to your video file
const res = await publishToTikTok(path, {
  mode: "direct",
  source: "FILE_UPLOAD",
  title: "New work from the studio",
  privacyLevel: "PUBLIC_TO_EVERYONE",
  disableDuet: false,
  disableStitch: true,
  disableComment: false,
  videoCoverTimestampMs: 1500,
  isAIGC: true, // label as AI-generated, if appropriate
});
console.log(res.publishId, res.status?.data?.status);