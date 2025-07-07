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
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "You write SongGeneration description strings. "
          + "Think of six musical dimensions: gender (male/female), timbre "
          + "(dark/bright/soft, etc.), genre (pop, jazz, rock…), emotion "
          + "(sad, energetic…), instrument (piano, drums, guitar…), and bpm "
          + "(integer).  Given any user text, respond ONLY with a JSON object "
          + "whose keys are some subset of these six; values must be concise "
          + "single tokens except bpm which must be an integer (e.g. 120). "
          + "Return no commentary."
        },
        { role: "user", content: `Create description tags for: "${prompt}"` }
      ]
    });

    const obj = JSON.parse(response.choices[0].message.content);

    const parts = [];
    if (obj.gender)       parts.push(obj.gender.toLowerCase());
    if (obj.timbre)       parts.push(obj.timbre.toLowerCase());
    if (obj.genre)        parts.push(obj.genre.toLowerCase());
    if (obj.emotion)      parts.push(obj.emotion.toLowerCase());
    if (obj.instrument)   parts.push(obj.instrument.toLowerCase());
    if (obj.bpm)          parts.push(`the bpm is ${obj.bpm}`);

    return parts.join(', ');
  },
  //       create song lyrics (song tags are ${tagPrompt}). \n
  createLyrics: async (prompt, createdStyleTags) => {
    /*  Generate ACE‑Step‑ready lyrics using an LLM.
        • 'prompt'            – high‑level concept or mood from the user
        • 'createdStyleTags'  – comma‑separated tag list produced by createStyleTags()
        The LLM is forced to return a JSON object with keys:
        verse1, chorus, verse2, bridge, outro  (any missing keys are allowed).
        We then flatten that object into bracketed sections that
        ACE‑Step understands, e.g.:
 
          [verse]
          text…
          [chorus]
          text…
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
            "You are a professional lyricist writing for an AI music generator "
            + "(ACE-Step). Write concise lyrics and label each section. "
            + "Return ONLY a JSON object whose keys are any of: "
            + "'verse1','chorus','verse2','bridge','outro'. "
            + "Each value must be 1–4 short lines, no commentary. "
            + `Incorporate these style tags: ${createdStyleTags}.`
            + "never use the words 'shadows, echo' in the response."
        },
        {
          role: "user",
          content: `Compose lyrics inspired by: "${prompt}"`
        }
      ]
    });

    const sections = JSON.parse(completion.choices[0].message.content);

    // Preserve the section order exactly as the LLM returned it
    const formatted = Object.keys(sections)
      .filter(k => sections[k] && typeof sections[k] === 'string')
      .map(k => `[${k.replace(/\d+/, '')}]\n${sections[k]}`)
      .join('\n\n');

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
          // Map 1‑to‑1 to the fields expected by post‑to‑Leo
          description: descriptionInput,                   // optional song description
          prompt_audio: options.prompt_audio || null, // optional reference audio file path
          genre: options.genre || 'auto',            // match DEFAULTS.genre
          cfg_coef: options.cfg_coef ?? 1.0,        // 0.1 – 3.0
          temperature: options.temperature ?? 0.7,  // 0.1 – 2.0
          top_k: options.top_k ?? 20                // 1 – 100
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
