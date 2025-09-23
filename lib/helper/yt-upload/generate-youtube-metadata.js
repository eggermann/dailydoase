import fs from 'fs-extra';
import path from 'path';
import fg from 'fast-glob';
import { saveJSON } from '../../generator/save-utils.js';
import dotenv from 'dotenv';
dotenv.config();
// Note: do NOT import OpenAI at module scope to avoid top-level-await
// and to ensure we never require the package when no API key is present.
let OpenAI = null;

/**
 * Scan a directory of JSON metadata (e.g., FLUX prompts) and generate
 * YouTube title + description. If OPENAI_API_KEY is missing, falls back
 * to a local heuristic using available JSON fields.
 *
 * @param {object} params
 * @param {string} params.dirPath - Directory with JSON files (e.g. parts/180-FLUX)
 * @param {string} [params.projectName] - Optional art project name to include
 * @param {string} [params.language='en'] - Language hint for the output
 * @returns {Promise<{ title: string, description: string }>} YouTube metadata
 */
export async function generateYouTubeMetadataFromDir({ dirPath, projectName, language = 'en' } = {}) {
  if (!dirPath) throw new Error('generateYouTubeMetadataFromDir: dirPath is required');

  const files = await fg(['*.json'], { cwd: dirPath, dot: false });



  if (!files || files.length === 0) {
    // still return a default structure
    return fallbackMeta([], { projectName, language });
  }




  const docs = [];
  for (const f of files.sort()) {
    try {
      const j = await fs.readJson(path.join(dirPath, f));
      docs.push({ file: f, data: j });
    } catch {
      // ignore unreadable json
    }
  }
  const prompts = docs.map(d => d?.data?.prompt).filter(Boolean);
  const sampleText = prompts.map((p, i) => `-scene ${i + 1}--\n${p}`).join('\n\n');

  console.log(`${sampleText} prompts.`);

  const apiKey = process.env.OPENAI_API_KEY;


  // Lazy import OpenAI only if we have an API key
  if (apiKey && !OpenAI) {
    try { ({ default: OpenAI } = await import('openai')); } catch { OpenAI = null; }
  }


  console.log(`[generateYouTubeMetadataFromDir] Using ${apiKey ? 'OpenAI' : 'fallback'} method for YouTube metadata generation`);



  // Use OpenAI to craft a good title + description
  const client = new OpenAI({ apiKey });
  const sys = `You are a helpful assistant drafting concise YouTube metadata. ` +
    `Return strict JSON with keys: title, description. ` +
    `The description must include a subheading line starting with '☠️ Art Project —' 
    followed by one short sentence about the creative intent, language as a driver ` +
    `Keep the title under 80 characters, punchy, no emojis.`;
  const user = `Language: ${language}\n` +
    (projectName ? `Project: ${projectName}\n` : '') +
    `Source excerpts (JSON prompt fields):\n${sampleText}\n\n` +
       `Write a compelling YouTube title and a 3–5 sentence description referencing the best scenes. ` +
           `End description with relevant hashtags. Add thanks for sponsoring video-to-sound model to mirelo.ai.`;
/*
    
    const client2 = new OpenAI({ apiKey });
  const sys2 = `You are a helpful assistant drafting concise YouTube metadata. ` +
              `Return strict JSON with keys: title, description. ` +
              `The description must include a subheading line starting with 'Art Project —' followed by one short sentence about the creative intent. ` +
              `Keep the title under 80 characters, punchy, no emojis.`;
  const user2 = `Language: ${language}\n` +
               (projectName ? `Project: ${projectName}\n` : '') +
               `Source excerpts (JSON prompt fields):\n${sampleText}\n\n` +
               `Write a compelling YouTube title and a 3–5 sentence description referencing the themes. ` +
               `End description with 3–6 relevant hashtags.`;*/
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });


    const content = completion?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);



    if (parsed?.title && parsed?.description) {
      try {
        await saveJSON(path.join(dirPath, 'youtube-metadata'), {
          mode: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          dirPath,
          projectName,
          language,
          prompts: prompts.slice(0, 6),
          raw: content,
          result: parsed,
        });
      } catch { }
      return parsed;
    }
  } catch (e) {
    // swallow and fall back
  }

  const fb = fallbackMeta(prompts, { projectName, language });
  try { await saveJSON(path.join(dirPath, 'youtube-metadata'), { mode: 'fallback-after-error', dirPath, projectName, language, prompts: prompts.slice(0, 6), result: fb }); } catch { }
  return fb;
}

function fallbackMeta(prompts, { projectName, language }) {
  const base = (prompts && prompts.length ? String(prompts[0]).trim() : '').slice(0, 120);
  const safeProject = projectName ? ` — ${projectName}` : '';
  const title = (base || 'Art video prompt').replace(/\s+/g, ' ').slice(0, 70) + safeProject;
  const descLines = [
    // Keep a clear subheading starting with "Art Project —" as requested
    `Art Project — ${projectName || 'A short study in cinematic staging and identity.'}`,
    '',
    'This video explores theatrical composition, light, and character tension, translated from prompt-driven image concepts into motion.',
  ];
  if (prompts && prompts.length) {
    descLines.push('', 'Source prompts (selection):');
    for (const p of prompts.slice(0, 3)) descLines.push(`- ${String(p).slice(0, 180)}`);
  }
  descLines.push('', '#art #ai #video #creative #experimental');
  return { title, description: descLines.join('\n') };
}

export default generateYouTubeMetadataFromDir;
