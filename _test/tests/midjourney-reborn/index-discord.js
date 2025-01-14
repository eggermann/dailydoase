import {Midjourney} from "midjourney";
import 'dotenv/config'
const SERVER_ID="1116379378536960113"
const CHANNEL_ID="1116379378536960114"
const SALAI_TOKEN="MTEwNzU0ODQ4OTA0MDI3MzUwOQ.GroKgu.8S9aksWGPF7MXsnXJh14yASStmKa9em2as2Q_k"

const client = new Midjourney({
    ServerId:SERVER_ID,
    ChannelId: CHANNEL_ID,
    SalaiToken: SALAI_TOKEN,
    Debug: true,
    Ws: true,
});
await client.init();
const msg = await client.Imagine("A little pink elephant", (uri) => {
    console.log("loading", uri);
});
console.log({msg});