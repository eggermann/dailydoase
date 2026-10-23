import { createRequire } from 'node:module';

const require = createRequire(new URL('../../package.json', import.meta.url));
const semanticStream = require('semantic-stream');

export const initStreams = semanticStream.initStreams;
