import {Midjourney} from "midjourney";
import 'dotenv/config'


const client = new Midjourney({
    ServerId: process.env.SERVER_ID,
    ChannelId: process.env.CHANNEL_ID,
    SalaiToken: process.env.SALAI_TOKEN,
    Debug: true,
    Ws: true,
});
await client.init();
const msg = await client.Imagine("A little pink elephant", (uri: string) => {
    console.log("loading", uri);
});
console.log({msg});