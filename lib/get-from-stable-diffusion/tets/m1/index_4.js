import { Midjourney } from "midjourney-discord-api";
import nativebird from "nativebird";

const client = new Midjourney("interaction.txt");

// client.setDiscordChannelUrl("https://discord.com/channels/662267976984297473/995431151084773486"); // change yout channel

const prompts = [];
const basePrompt = "einstein mathematician studying at school --c 100";
for (let i = 1; i <= 1; i++) {
    const seed = 120 + i;
    const prompt = `${basePrompt} --seed ${seed}`;
    prompts.push({ prompt, seed });
}

await nativebird.map(prompts, async ({ prompt, seed }) => {

  console.log(prompt)
    const msg = await client.imagine(prompt, i=>{
        console.log('**',i);
    });
    await msg.download(0, "images");
}, { concurrency: 3 });