import { fileURLToPath } from 'url';
import path from 'path';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

// Resolve __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Get Hugging Face API Token (optional, for rate limits/private spaces)
const HF_TOKEN = process.env.HF_API_TOKEN || process.env.HF_TOKEN;

/**
 * Generates music using the ACE-Step Gradio Space.
 *
 * Parameters are read from the ACEStepParams singleton.
 * @returns {Promise<string>} Path to the generated music file.
 */

// Singleton for ACE-Step parameters
class ACEStepParams {
  static instance = new ACEStepParams();
  set(params) {
    Object.assign(this, params);
  }
  get() {
    return this;
  }
}

async function generateMusicWithACEStep() {
  const {
    audio_duration,
    prompt,
    lyrics,
    infer_step,
    guidance_scale,
    scheduler_type,
    /*cfg_type,
    omega_scale,
    manual_seeds,
    guidance_interval,
    guidance_interval_decay,
    min_guidance_scale,
    use_erg_tag,
    use_erg_lyric,
    use_erg_diffusion,
    oss_steps,
    guidance_scale_text,
    guidance_scale_lyric,
    audio2audio_enable,
    ref_audio_strength,
    ref_audio_input,
    lora_name_or_path*/
  } = ACEStepParams.instance.get();
  console.log('🔌 Connecting to ACE-Step Gradio Space…');
  let app;
  try {
    app = await Client.connect('ACE-Step/ACE-Step', { hf_token: HF_TOKEN });
    console.log('✅ Connected to ACE-Step.');

    // 1) Inspect available endpoints or functions
    console.log('Available endpoints:', app.fn_list);
    // Use the Text2Music endpoint directly
    const fn = '/__call__';

    // 2) Build payload matching the API field names
    const payload = {
      audio_duration,
      prompt,
      lyrics,
      infer_step,
      /*    guidance_scale,
    scheduler_type,
 cfg_type,
    omega_scale,
    manual_seeds,
    guidance_interval,
    guidance_interval_decay,
    min_guidance_scale,
    use_erg_tag,
    use_erg_lyric,
    use_erg_diffusion,
    oss_steps,
    guidance_scale_text,
    guidance_scale_lyric,
    audio2audio_enable,
    ref_audio_strength,
    ref_audio_input,
    lora_name_or_path*/
    };

    console.log(`▶ Calling endpoint ${fn} with payload:`);
    console.log(payload);

    // 3) Invoke the Space
    const result = await app.predict(fn, payload);
    console.log('📦 Raw result:', JSON.stringify(result, null, 2));

    // 4) Extract audio output
    let audioOut = Array.isArray(result)
      ? result[0]
      : result.audio ?? result.data?.[0];
    if (!audioOut) throw new Error('No audio data in the Space response');

    let audioBuffer;
    // Handle Gradio FileData object (contains a URL)
    if (typeof audioOut === 'object' && audioOut.url) {
      console.log('Fetching audio from URL:', audioOut.url);
      const resp = await fetch(audioOut.url);
      if (!resp.ok) throw new Error(`Failed to fetch audio file: ${resp.statusText}`);
      audioBuffer = Buffer.from(await resp.arrayBuffer());
    }
    // If it's base64-encoded
    else if (typeof audioOut === 'string' && audioOut.startsWith('data:audio/')) {
      console.log('Received base64 encoded audio data.');
      const base64Content = audioOut.split(',')[1];
      audioBuffer = Buffer.from(base64Content, 'base64');
    }
    // If it's a direct URL string
    else if (typeof audioOut === 'string' && audioOut.startsWith('http')) {
      console.log(`Received direct audio URL: ${audioOut}. Fetching...`);
      const response = await fetch(audioOut);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio from URL: ${response.statusText} (${response.status})`);
      }
      audioBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      console.error('Unrecognized audio output shape:', audioOut);
      throw new Error('Cannot process audio output format');
    }

    // 5) Save to disk
    const outDir = path.join(__dirname, 'generated_music');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const filename = `music_${Date.now()}.wav`;
    const outPath = path.join(outDir, filename);
    writeFileSync(outPath, audioBuffer);
    console.log('💾 Music saved to:', outPath);

    return outPath;

  } catch (error) {
    console.error('❌ Error during music generation:', error);
    if (app && error.response) {
      console.error('Response status:', error.response.status);
      try {
        const body = await error.response.text();
        console.error('Response body:', body);
      } catch { }
    }
    throw error;
  }
}

// --- Usage Example ---
(async () => {
  try {
    ACEStepParams.instance.set({
      audio_duration: 60,
      prompt: 'funk, pop, soul, rock, melodic, guitar, drums, bass, keyboard, percussion, 105 BPM, energetic, upbeat, groovy, vibrant, dynamic',
      lyrics: `[verse]
Neon lights they flicker bright
City hums in dead of night
Rhythms pulse through concrete veins
Lost in echoes of refrains

[verse]
Bassline groovin' in my chest
Heartbeats match the city's zest
Electric whispers fill the air
Synthesized dreams everywhere

[chorus]
Turn it up and let it flow
Feel the fire let it grow
In this rhythm we belong
Hear the night sing out our song

[verse]
Guitar strings they start to weep
Wake the soul from silent sleep
Every note a story told
In this night we’re bold and gold

[bridge]
Voices blend in harmony
Lost in pure cacophony
Timeless echoes timeless cries
Soulful shouts beneath the skies

[verse]
Keyboard dances on the keys
Melodies on evening breeze
Catch the tune and hold it tight
In this moment we take flight
`,
      infer_step: 60,
      guidance_scale: 15,
      scheduler_type: 'euler',

    });

    const path = await generateMusicWithACEStep();
    console.log('Successfully generated music:', path);
  } catch (err) {
    console.error('Generation failed:', err);
  }
})();
