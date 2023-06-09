import Midjourney from "midjourney-discord-api";

const cli = new Midjourney("/Users/d.eggermann/semantic-api/lib/get-from-stable-diffusion/tets/midjourney-reborn/interaction.txt");
const msgs = await cli.getMessages();
console.log(msgs.length + " messages visibles"); // by default get 50 messages