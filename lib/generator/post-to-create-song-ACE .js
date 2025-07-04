import PostTo from './PostTo.js';
import promptCreator from '../prompt-creator.js';
import ace from './post-to-ACE.js'; // Import ACE-Step client



import chatModelProbe from '../helper/modelProbe/chatModelProbe.js'; // Import chatModelProbe to use in prompt creation
const TARGET_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const prompts = {
  createStyleTags: async (prompt) => {
    /*  Generate up‑to‑date ACE‑Step style tags **and** a short voice
        description (e.g. “warm female alto, airy, intimate”) from an
        arbitrary scene sentence.

        – The LLM must return a JSON object:
          {
            "tags":  [ "lo‑fi", "hip‑hop", ... ],   // ≤ 12 items
            "voice": "one‑sentence vocal description"
          }
        – We join the tag array into the classic comma‑separated string,
          but we KEEP the voice string so callers can use or log it.
    */
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an assistant that prepares input for the ACE‑Step text‑to‑music model. "
                 + "Given any user sentence, respond ONLY with a JSON object containing two keys: "
                 + "\"tags\" – an array (max 5) of concise, lowercase music tags (genres, moods, "
                 + "instruments, production descriptors, tempo like \"90 bpm\", key like \"c minor\"), "
                 + "and \"voice\" – a single short English sentence that describes a suitable singing "
                 + "voice for those tags (e.g. \"soft male baritone with slight rasp\"). "
                 + "Do not include any other keys or commentary."
        },
        {
          role: "user",
          content: `Generate tags and voice from: "${prompt}"`
        }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    // const tagString = Array.isArray(parsed.tags) ? parsed.tags.join(", ") : "";
    const reducedTagsArray = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
    const tagString = reducedTagsArray.join(", ");
    const voiceDescription = typeof parsed.voice === "string" ? parsed.voice.trim() : "";

    return { tags: tagString, voice: voiceDescription };
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

      const { tags: prompTags, voice } = await prompts.createStyleTags(totalPrompt);

      console.log('\x1b[36m%s\x1b[0m', `prompt tags : ${prompTags}`);
      console.log('\x1b[33m%s\x1b[0m', `suggested voice : ${voice}`);


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
