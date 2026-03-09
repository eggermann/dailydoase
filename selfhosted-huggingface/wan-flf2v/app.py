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


MODEL_ID = os.getenv('WAN_MODEL_ID', 'Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers')
MAX_AREA = 1280 * 720
FPS = 16
DEFAULT_SETTINGS = {
  'low': {
    'num_frames': 49,
    'fps': 16,
    'steps': 16,
    'guidance': 3.5,
    'max_area': 832 * 480,
  },
  'mid': {
    'num_frames': 65,
    'fps': 16,
    'steps': 24,
    'guidance': 4.0,
    'max_area': 1280 * 720,
  },
  'high': {
    'num_frames': 81,
    'fps': 16,
    'steps': 36,
    'guidance': 5.0,
    'max_area': 1280 * 720,
  },
}

pipe = None
loaded_model_id = None


def aspect_ratio_resize(image, max_area=MAX_AREA):
  width, height = image.size
  aspect_ratio = height / width
  target_height = int(round(math.sqrt(max_area * aspect_ratio) / 16) * 16)
  target_width = int(round(math.sqrt(max_area / aspect_ratio) / 16) * 16)
  return image.resize((target_width, target_height), Image.LANCZOS), target_height, target_width


def unload_pipeline():
  global pipe
  global loaded_model_id

  if pipe is not None:
    del pipe
    pipe = None
  loaded_model_id = None
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
  return (
    gr.update(value=preset['num_frames']),
    gr.update(value=preset['fps']),
    gr.update(value=preset['steps']),
    gr.update(value=preset['guidance']),
    gr.update(value=preset['max_area']),
    f"Preset: `{level.capitalize()}`",
    gr.update(variant=low_variant),
    gr.update(variant=mid_variant),
    gr.update(variant=high_variant),
  )


@spaces.GPU
def generate_video(
  first_image,
  last_image,
  model_id,
  prompt,
  negative_prompt,
  num_frames,
  num_inference_steps,
  guidance_scale,
  fps,
  seed,
  randomize_seed,
  custom_max_area,
):
  if first_image is None or last_image is None:
    raise gr.Error('Upload both a start frame and an end frame.')

  resolved_model_id = (model_id or MODEL_ID).strip() or MODEL_ID
  pipeline = ensure_pipeline(resolved_model_id)
  first_image = first_image.convert('RGB')
  last_image = last_image.convert('RGB')
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else MAX_AREA
  first_image, height, width = aspect_ratio_resize(first_image, max_area=resolved_max_area)
  last_image = last_image.resize((width, height), Image.LANCZOS)

  resolved_seed = int(torch.seed() % 1000000) if randomize_seed else int(seed)
  generator = torch.Generator(device='cpu').manual_seed(resolved_seed)
  result = pipeline(
    image=first_image,
    last_image=last_image,
    prompt=prompt,
    negative_prompt=negative_prompt or None,
    height=height,
    width=width,
    num_frames=int(num_frames),
    num_inference_steps=int(num_inference_steps),
    guidance_scale=float(guidance_scale),
    generator=generator,
  )

  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  export_to_video(result.frames[0], output_path, fps=int(fps))
  return output_path, (
    f"Generated with `{resolved_model_id}` at `{width}x{height}`, "
    f"`{int(num_frames)}` frames, `{int(fps)}` fps, "
    f"`{int(num_inference_steps)}` steps, guidance `{float(guidance_scale):.1f}`, seed `{resolved_seed}`."
  )


with gr.Blocks(theme=gr.themes.Soft(), title='Wan FLF2V') as demo:
  gr.Markdown(
    '''
    # Wan FLF2V
    Upload a start frame and an end frame to generate a transition video with Wan 2.1.

    This starter uses `Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers`. It needs a GPU Space.
    If generation fails with a hardware message, open `Settings -> Hardware` and choose `ZeroGPU` or a paid GPU.
    '''
  )

  with gr.Row():
    with gr.Column():
      first_image_input = gr.Image(type='pil', label='Start frame')
      last_image_input = gr.Image(type='pil', label='End frame')
      model_id_input = gr.Textbox(
        label='Model repo ID',
        value=MODEL_ID,
      )
      prompt_input = gr.Textbox(
        label='Prompt',
        lines=4,
        value='Smooth cinematic transition, coherent motion, natural lighting, detailed subject consistency, high quality.',
      )
      negative_prompt_input = gr.Textbox(
        label='Negative prompt',
        lines=2,
        value='blurry, flicker, jitter, warped anatomy, melting details, sudden scene changes',
      )
      with gr.Row():
        num_frames_input = gr.Slider(33, 121, value=65, step=4, label='Frames')
        fps_input = gr.Slider(8, 24, value=16, step=1, label='Output fps')
      with gr.Row():
        steps_input = gr.Slider(8, 60, value=24, step=1, label='Inference steps')
        guidance_input = gr.Slider(1.0, 8.0, value=4.0, step=0.5, label='Guidance scale')
      with gr.Row():
        seed_input = gr.Slider(0, 999999, value=42, step=1, label='Seed')
        randomize_seed_input = gr.Checkbox(value=False, label='Randomize seed')
      custom_max_area_input = gr.Number(
        label='Custom max area (optional)',
        value=DEFAULT_SETTINGS['mid']['max_area'],
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
        - Keep both frames visually related.
        - Use similar aspect ratios for the two images.
        - `65` frames at `16 fps` is a good balanced default.
        - Lower guidance gives more natural motion; higher guidance follows the prompt more strictly.
        - `Custom max area` lets you override the default resolution budget directly.
        - ZeroGPU queues can be slow.
        '''
      )

  low_button.click(
    fn=lambda: preset_values('low'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )
  mid_button.click(
    fn=lambda: preset_values('mid'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )
  high_button.click(
    fn=lambda: preset_values('high'),
    outputs=[num_frames_input, fps_input, steps_input, guidance_input, custom_max_area_input, preset_output, low_button, mid_button, high_button],
  )

  generate_button.click(
    fn=generate_video,
    inputs=[
      first_image_input,
      last_image_input,
      model_id_input,
      prompt_input,
      negative_prompt_input,
      num_frames_input,
      steps_input,
      guidance_input,
      fps_input,
      seed_input,
      randomize_seed_input,
      custom_max_area_input,
    ],
    outputs=[video_output, status_output],
  )


if __name__ == '__main__':
  demo.launch()
