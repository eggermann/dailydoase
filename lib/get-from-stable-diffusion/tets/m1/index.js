import Midjourney from "midjourney-discord-api";

const cli = new Midjourney("./interaction.txt");
const msgs = await cli.getMessages();
console.log(msgs,msgs.length + " messages visibles"); // by default get 50 messages