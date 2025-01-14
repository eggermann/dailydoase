import Midjourney from "midjourney-discord-api";




import nativebird from "nativebird";
import {ProgressLogger} from "progress-logger-js"

const client = new Midjourney("./interaction_2.txt");
//await client.connectWs();
// client.setDiscordChannelUrl("https://discord.com/channels/662267976984297473/995431151084773486"); // change yout channel

const prompts = [];
const basePrompt = "hello familie redlich and cps-it world --c 20";
for (let i = 1; i <= 1; i++) {
    const seed = 120 + i;
    const prompt = `${basePrompt} --seed ${seed} --testp --aspect 3:2`;
    prompts.push({ prompt, seed });
}


await nativebird.map(prompts, async ({ prompt, seed }) => {
    const msg = await client.imagine(prompt);
    console.log(msg)
  await msg.download(0, "images");
}, { concurrency: 3 });