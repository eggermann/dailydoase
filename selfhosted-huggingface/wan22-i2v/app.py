import gc
import json
import math
import os
import tempfile
from functools import wraps

try:
  import spaces
except (ImportError, RuntimeError) as exc:
  print(f'[warn] spaces import unavailable, using local GPU decorator fallback: {exc}')

  class _SpacesFallback:
    @staticmethod
    def GPU(*_args, **_kwargs):
      def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
          return fn(*args, **kwargs)
        return wrapper
      return decorator

  spaces = _SpacesFallback()

import gradio as gr
import torch
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
from diffusers.utils import export_to_video
from PIL import Image
from transformers import CLIPVisionModel


MODEL_ID = os.getenv('WAN_MODEL_ID', 'Wan-AI/Wan2.2-I2V-A14B-Diffusers')
DEFAULT_MAX_AREA = int(os.getenv('WAN_DEFAULT_MAX_AREA', str(832 * 480)))
DEFAULT_NUM_FRAMES = int(os.getenv('WAN_DEFAULT_NUM_FRAMES', '49'))
DEFAULT_FPS = int(os.getenv('WAN_DEFAULT_FPS', '16'))
DEFAULT_STEPS = int(os.getenv('WAN_DEFAULT_STEPS', '24'))
DEFAULT_GUIDANCE = float(os.getenv('WAN_DEFAULT_GUIDANCE', '5.0'))
DEFAULT_SEED = int(os.getenv('WAN_DEFAULT_SEED', '42'))
RESOLUTION_PROFILES = {
  'small 480p-ish': 832 * 480,
  'balanced 720p-ish': 1280 * 720,
}
DEFAULT_SETTINGS = {
  'low': {
    'num_frames': 33,
    'fps': 12,
    'steps': 16,
    'guidance': 4.0,
    'max_area': 832 * 480,
  },
  'mid': {
    'num_frames': 49,
    'fps': 16,
    'steps': 24,
    'guidance': 5.0,
    'max_area': 832 * 480,
  },
  'high': {
    'num_frames': 65,
    'fps': 16,
    'steps': 32,
    'guidance': 5.5,
    'max_area': 1280 * 720,
  },
}

pipe = None
loaded_model_id = None


def aspect_ratio_resize(image, max_area):
  width, height = image.size
  aspect_ratio = height / width
  target_height = max(16, int(round(math.sqrt(max_area * aspect_ratio) / 16) * 16))
  target_width = max(16, int(round(math.sqrt(max_area / aspect_ratio) / 16) * 16))
  return image.resize((target_width, target_height), Image.LANCZOS), target_height, target_width


def unload_pipeline():
  global pipe
  global loaded_model_id

  if pipe is not None:
    del pipe
    pipe = None
  loaded_model_id = None
  gc.collect()
  if torch.cuda.is_available():
    torch.cuda.empty_cache()


def ensure_pipeline(model_id):
  global pipe
  global loaded_model_id

  if pipe is not None and loaded_model_id == model_id:
    return pipe

  if not torch.cuda.is_available():
    raise gr.Error(
      'No GPU is available. In your Hugging Face Space, open Settings > Hardware and switch to ZeroGPU or a paid GPU.'
    )

  unload_pipeline()

  image_encoder = CLIPVisionModel.from_pretrained(
    model_id,
    subfolder='image_encoder',
    torch_dtype=torch.float32,
  )
  vae = AutoencoderKLWan.from_pretrained(
    model_id,
    subfolder='vae',
    torch_dtype=torch.float32,
  )
  pipe = WanImageToVideoPipeline.from_pretrained(
    model_id,
    image_encoder=image_encoder,
    vae=vae,
    torch_dtype=torch.bfloat16,
  )
  pipe.enable_model_cpu_offload()
  pipe.vae.enable_tiling()
  loaded_model_id = model_id
  return pipe


def preset_values(level):
  preset = DEFAULT_SETTINGS[level]
  low_variant = 'primary' if level == 'low' else 'secondary'
  mid_variant = 'primary' if level == 'mid' else 'secondary'
  high_variant = 'primary' if level == 'high' else 'secondary'
  resolution_profile = next(
    (label for label, area in RESOLUTION_PROFILES.items() if area == preset['max_area']),
    'small 480p-ish',
  )
  return (
    gr.update(value=preset['num_frames']),
    gr.update(value=preset['fps']),
    gr.update(value=preset['steps']),
    gr.update(value=preset['guidance']),
    gr.update(value=resolution_profile),
    gr.update(value=preset['max_area']),
    f"Preset: `{level.capitalize()}`",
    gr.update(variant=low_variant),
    gr.update(variant=mid_variant),
    gr.update(variant=high_variant),
  )


@spaces.GPU
def generate_video(
  image,
  model_id,
  prompt,
  negative_prompt,
  num_frames,
  num_inference_steps,
  guidance_scale,
  fps,
  seed,
  randomize_seed,
  resolution_profile,
  custom_max_area,
):
  if image is None:
    raise gr.Error('Upload a start frame.')

  resolved_model_id = (model_id or MODEL_ID).strip() or MODEL_ID
  pipeline = ensure_pipeline(resolved_model_id)
  image = image.convert('RGB')
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else RESOLUTION_PROFILES[resolution_profile]
  image, height, width = aspect_ratio_resize(image, max_area=resolved_max_area)

  resolved_seed = int(torch.seed() % 1000000) if randomize_seed else int(seed)
  generator = torch.Generator(device='cpu').manual_seed(resolved_seed)
  result = pipeline(
    image=image,
    prompt=prompt,
    negative_prompt=negative_prompt or None,
    height=height,
    width=width,
    num_frames=int(num_frames),
    num_inference_steps=int(num_inference_steps),
    guidance_scale=float(guidance_scale),
    generator=generator,
  )

  actual_frames = len(result.frames[0]) if result and getattr(result, 'frames', None) else 0
  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  export_to_video(result.frames[0], output_path, fps=int(fps))

  diagnostic = {
    'model_id': resolved_model_id,
    'width': width,
    'height': height,
    'requested_frames': int(num_frames),
    'actual_frames': actual_frames,
    'fps': int(fps),
    'duration_seconds': round(actual_frames / int(fps), 3) if actual_frames and int(fps) > 0 else 0,
    'steps': int(num_inference_steps),
    'guidance': float(guidance_scale),
    'seed': resolved_seed,
  }
  print(f'[wan22-i2v] {json.dumps(diagnostic, ensure_ascii=True)}')

  return output_path, (
    f"Generated with `{resolved_model_id}` at `{width}x{height}`, "
    f"`{actual_frames}` actual frames (`{int(num_frames)}` requested), `{int(fps)}` fps, "
    f"`{int(num_inference_steps)}` steps, guidance `{float(guidance_scale):.1f}`, seed `{resolved_seed}`."
  )


with gr.Blocks(theme=gr.themes.Soft(), title='Wan 2.2 I2V') as demo:
  gr.Markdown(
    '''
    # Wan 2.2 I2V
    Upload one image and generate video with `Wan-AI/Wan2.2-I2V-A14B-Diffusers`.

    This Space is meant as a cleaner Wan 2.2 baseline when `wan-flf2v` drifts too hard on large start/end gaps.
    '''
  )

  with gr.Row():
    with gr.Column():
      image_input = gr.Image(type='pil', label='Start frame')
      model_id_input = gr.Textbox(label='Model repo ID', value=MODEL_ID)
      prompt_input = gr.Textbox(
        label='Prompt',
        lines=4,
        value='Natural motion, strong subject continuity, realistic lighting, stable background, coherent body movement.',
      )
      negative_prompt_input = gr.Textbox(
        label='Negative prompt',
        lines=2,
        value='flicker, jitter, sudden scene change, warped anatomy, melting face, broken background',
      )
      with gr.Row():
        num_frames_input = gr.Slider(17, 121, value=DEFAULT_NUM_FRAMES, step=4, label='Frames')
        fps_input = gr.Slider(8, 24, value=DEFAULT_FPS, step=1, label='Output fps')
      with gr.Row():
        steps_input = gr.Slider(8, 60, value=DEFAULT_STEPS, step=1, label='Inference steps')
        guidance_input = gr.Slider(1.0, 8.0, value=DEFAULT_GUIDANCE, step=0.5, label='Guidance scale')
      with gr.Row():
        seed_input = gr.Slider(0, 999999, value=DEFAULT_SEED, step=1, label='Seed')
        randomize_seed_input = gr.Checkbox(value=False, label='Randomize seed')
      resolution_profile_input = gr.Radio(
        list(RESOLUTION_PROFILES.keys()),
        value='small 480p-ish',
        label='Resolution profile',
      )
      custom_max_area_input = gr.Number(
        label='Custom max area (optional)',
        value=DEFAULT_MAX_AREA,
        precision=0,
      )
      with gr.Row():
        low_button = gr.Button('Low')
        mid_button = gr.Button('Mid', variant='primary')
        high_button = gr.Button('High')
      preset_output = gr.Markdown('Preset: `Mid`')
      generate_button = gr.Button('Generate video', variant='primary')

    with gr.Column():
      video_output = gr.Video(label='Output video', autoplay=True)
      status_output = gr.Markdown('No run yet.')
      gr.Markdown(
        '''
        Tips:
        - Keep the subject large and readable in the source frame.
        - Use short, physically plausible actions.
        - `49` frames at `16 fps` is a good balanced default.
        - If identity drifts, shorten the action before raising resolution.
        '''
      )

  low_button.click(
    fn=lambda: preset_values('low'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, resolution_profile_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )
  mid_button.click(
    fn=lambda: preset_values('mid'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, resolution_profile_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )
  high_button.click(
    fn=lambda: preset_values('high'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, resolution_profile_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )

  generate_button.click(
    fn=generate_video,
    inputs=[
      image_input,
      model_id_input,
      prompt_input,
      negative_prompt_input,
      num_frames_input,
      steps_input,
      guidance_input,
      fps_input,
      seed_input,
      randomize_seed_input,
      resolution_profile_input,
      custom_max_area_input,
    ],
    outputs=[video_output, status_output],
  )


if __name__ == '__main__':
  demo.launch()
