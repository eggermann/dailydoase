import PostTo from './PostTo.js';
import promptCreator from '../prompt-creator.js';
import ace from './post-to-ACE.js'; // Import ACE-Step client



import chatModelProbe from '../helper/modelProbe/chatModelProbe.js'; // Import chatModelProbe to use in prompt creation
const TARGET_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const prompts = {
  createStyleTags: async (prompt) => {
    /*  Use an LLM to generate up‑to‑date ACE‑Step style tags
        from an arbitrary sentence or scene description.

        – We instruct the model to return *only* a JSON object
          with a "tags" array (max 12 items).
        – No additional commentary is allowed; we trim and join
          the array before returning so downstream code can treat
          it exactly like the old “string of tags” behaviour.
    */
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a music‑style tag generator for the ACE‑Step text‑to‑music model. "
            + "Given any user sentence, return a JSON object with a single key, "
            + "\"tags\", whose value is an array (max 12 items) of concise, lowercase music tags. "
            + "Tags can be genres, moods, instrumentation, production descriptors, "
            + "tempo like \"90 bpm\", or key like \"c minor\". Do not include any other keys or commentary."
      
        },
        {
          role: "user",
          content: `Generate tags from: "${prompt}"`
        }
      ]
    });

    // LLM is forced to reply with a JSON object per response_format.
    const parsed = JSON.parse(response.choices[0].message.content);
    const tagsArray = Array.isArray(parsed.tags) ? parsed.tags : [];
    return tagsArray.join(", ");
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
            + "never use the words 'shadows, echos' in the response."
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
    this.config.folderName = this.config.folderName ?? 'image-video';
    this.ltxVideo = null;
    this.flux = null;
  }

  async init() {
    this.ace = await ace.init(this.config);

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

      const prompTags = await prompts.createStyleTags(totalPrompt);

      console.log('\x1b[36m%s\x1b[0m', `prompt from createStyleTags : ${prompTags}`);


      const lyrics = await prompts.createLyrics(prompTags, totalPrompt);

      // Colorize model response for better visibility
      console.log('\x1b[35m%s\x1b[0m', `response createLyrics: ${lyrics}`);


      try {

        const newOptions = {

          lyrics: lyrics,
          audio_duration: options.audio_duration || 120, // Default to 10 seconds if not specified

        };
        // console.log('GenImgVideo prompt:', totalPrompt, defaultAndImageConfigMerged);

        const data1 = await this.ace.prompt(prompTags, newOptions);


        //console.log('Loaded FLUX images:', fluxImages.map(img => img.name || 'unnamed'));

        return true;
      } catch (error) {
        console.error('GenImgVideo', error);
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
