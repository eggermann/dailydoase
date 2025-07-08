import PostTo from './PostTo.js';
import promptCreator from '../prompt-creator.js';
import leo from './post-to-Leo.js'; // Import SongGeneration client



import chatModelProbe from '../helper/modelProbe/chatModelProbe.js'; // Import chatModelProbe to use in prompt creation
const TARGET_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const prompts = {
  createStyleTags: async (prompt) => {
    /*  Produce a “description” string that follows SongGeneration’s
        official input spec:
        gender, timbre, genre, emotion, instrument, bpm
        (any subset, comma‑separated, order free).

        The LLM must return a JSON object where each key is one of:
        gender, timbre, genre, emotion, instrument, bpm.
        We then flatten the object into a comma‑separated description
        string, adding “the bpm is N” if bpm is present.
    */
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You write SongGeneration description strings based on a user’s text. "
            + "Think of six musical dimensions: gender or animal voice, timbre (@any), genre or music style (even musique serious), emotion (@any), instrument (@any), additional feelings (@any). "
           // + "Always include the key 'instrument' with 1–3 concrete instruments even if the user text does not mention them, choosing instruments that best match the other dimensions. "
            + "When in doubt, prioritise describing instruments over other dimensions. "
            + "Return ONLY a JSON object whose keys are drawn from those dimensions (the key 'instrument' is mandatory) and whose values are concise. "
            + "Return no commentary."
        },
        { role: "user", content: `Create description tags for: "${prompt}"` }
      ]
    });

    const obj = JSON.parse(response.choices[0].message.content);

    const parts = [];
    Object.keys(obj).forEach(key => {
      if (obj[key]) {
      parts.push(obj[key].toString().toLowerCase());
      }
    });


    return parts.join(', ');
  },
  //       create song lyrics (song tags are ${tagPrompt}). \n
  createLyrics: async (prompt, createdStyleTags) => {
    /*
      Generate ACE‑Step‑ready lyrics using an LLM.
      • 'prompt'            – high‑level concept or mood from the user
      • 'createdStyleTags'  – comma‑separated tag list produced by createStyleTags()
      The LLM is forced to return a JSON object with allowed structure tags and strict formatting.
    */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      top_p: 0.95,
      messages: [
        {
          role: "system",
          content:
            "You are a professional songwriter crafting lyric strings for Tencent SongGeneration. "
            + "Follow these rules STRICTLY:\n"
            + "• Use only the structure tags: [intro-short], [intro-medium], [intro-long], [verse], [chorus], [bridge], [inst-medium], [outro-short], [outro-medium].\n"
            + "• Each tag opens a *segment paragraph* that must end with one blank line.\n"
            + "• Instrumental segments ([intro-*], [inst-*], [outro-*]) MUST return an **empty string** as their value so the final lyric contains *no words* in those segments.\n"
            + "• Lyrical segments ([verse], [chorus], [bridge]) must return one to four sentences, period‑separated, **without any other punctuation**.\n"
            + "• Do not include semicolons anywhere; paragraphs will be separated programmatically.\n"
            + "Return ONLY a JSON object whose keys are drawn from the allowed tags and whose values obey the above rules. No commentary."
        },
        {
          role: "user",
          content: `Compose inspired from: "${prompt}"`
        }
      ]
    });

    const sections = JSON.parse(completion.choices[0].message.content);

    // Preserve the section order exactly as the LLM returned it
    let formatted = Object.keys(sections)
      .filter(k => sections[k] && typeof sections[k] === 'string')
      .map(k => `[${k.replace(/\d+/, '')}]\n${sections[k]}`)
      .join('\n\n');

    /* ---------- ensure at least one instrumental break --------------------
    if (!/\[inst(?:-short|-medium|-long)?\]/i.test(formatted)) {
      // Prefer to place the break before the outro if it exists,
      // otherwise simply append it to the end.
      if (/\[outro\]/i.test(formatted)) {
        formatted = formatted.replace(/\[outro\]/i, '\n\n[inst-medium]\n\n$outro$')
                             .replace('$outro$', '[outro]');
      } else {
        formatted += '\n\n[inst-medium]';
      }
    } */

    return formatted.trim();
  },
}

/*

*/
/**
 * Configurable FLUX client, modeled after GenSeq.
 */
class GenImgVideo extends PostTo {
  /**
   * @param {object} modelConfig
   * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
   */
  constructor(modelConfig) {
    super(modelConfig);
    this.config = modelConfig;

    this.config.folderName = this.config.folderName ?? 'songs';
  }

  async init() {
    this.leo = await leo.init(this.config);

    // await store.initCache(this.imageDir);
    return this;
  }

  /**
   * Generate an image using the FLUX model.
   * @param {string} prompt
   * @param {object} [options]
   * @returns {Promise<string>} Path to saved image
   */
  async prompt(streams, options = {}) {
    await this.checkSignature();

    let prompt = await promptCreator.default(streams, options);
    let totalPrompt = this.addStaticPrompt(prompt, options);
    console.log('\x1b[31m%s\x1b[0m', `prompt from streams : ${totalPrompt}`);


    if (options.modelProbe) {
      const modelProbe = options.modelProbe;

      if (!chat) {
        chat = await chatModelProbe.init(modelProbe.TARGET_MODEL || TARGET_MODEL);
      }
    }



    // Now chat with the selected model
    try {

      const descriptionInput = await prompts.createStyleTags(totalPrompt);

      console.log('\x1b[36m%s\x1b[0m', `description : ${descriptionInput}`);


      const lyrics = await prompts.createLyrics(totalPrompt, descriptionInput);

      // Colorize model response for better visibility
      console.log('\x1b[35m%s\x1b[0m', `response createLyrics: ${lyrics}`);
      //return true;
      /*
       cfg.lyrics,
            cfg.description,
            null,                   // placeholder for prompt audio (may remain null)
            cfg.genre,
            cfg.cfg_coef,
            cfg.temperature,
            cfg.top_k
            */
      try {
        const newOptions = {
          description: descriptionInput,
          lyrics,
          cfg_coef: 1.2,
          temperature: 0.9,
          top_k: 50
        };

        const data1 = await this.leo.prompt(lyrics, newOptions);
        return true;
      } catch (error) {
        console.error('GenSongVideo‑LEO', error);
        return false;
      }

    } catch (err) {
      console.error('Error chatting with model:', err);
    }



    return true;
  }
}

let cachedInstance = null;

export default {
  init: async (config) => {
    const instance = new GenImgVideo(config).init();

    return instance;
  }
  /*,
  get: async () => cachedInstance || (async (config={}) => {
       const instance = new PostToFLUX(config);
      cachedInstance = await instance.init();
      return cachedInstance;
  })(),*/
}
