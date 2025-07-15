// These lines make "require" available
import {createRequire} from "module";
import {fileURLToPath} from 'url';
import path from 'path';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export default {require,__dirname};