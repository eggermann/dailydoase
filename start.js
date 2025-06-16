import pkg from './modulePolyfill.js';

const { require } = pkg;
const chalk = require('chalk');
const server = require("./lib/server/index.cjs");
const dotenv = require('dotenv');
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const semanticStream = require(__dirname+'/semantic-stream.js');

dotenv.config();

/*
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env[process.env.GROQ_API_KEY], // This is the default and can be omitted
});
*/




//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

export default async config => {
  //  console.log(chalk.green('Starting semantic stream server...'),semanticStream);
    semanticStream.init(config);
    server.init(() => { }, config)
}

//const a = _.getVerbs('beautiful running rising sun of merged lives. A beautiful cron is comining over the rainbow')
