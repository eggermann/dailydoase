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


MODEL_PRESETS = {
  'Wan 2.1 I2V 480P (official)': {
    'model_id': 'Wan-AI/Wan2.1-I2V-14B-480P-Diffusers',
    'max_area': 832 * 480,
  },
  'Wan 2.1 I2V 720P (official)': {
    'model_id': 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers',
    'max_area': 1280 * 720,
  },
  'Wan 2.2 I2V A14B (official)': {
    'model_id': 'Wan-AI/Wan2.2-I2V-A14B-Diffusers',
    'max_area': 1280 * 720,
  },
}
DEFAULT_SINGLE_MODEL_PRESET = os.getenv('WAN_SINGLE_MODEL_PRESET', 'Wan 2.1 I2V 480P (official)')
DEFAULT_SINGLE_CUSTOM_MODEL_ID = os.getenv('WAN_SINGLE_MODEL_ID', '').strip()
DEFAULT_SINGLE_MODEL_ID = MODEL_PRESETS.get(
  DEFAULT_SINGLE_MODEL_PRESET,
  MODEL_PRESETS['Wan 2.1 I2V 480P (official)'],
)['model_id']
DEFAULT_FIRST_LAST_MODEL_ID = os.getenv('WAN_FIRST_LAST_MODEL_ID', 'Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers')
DEFAULT_SINGLE_MAX_AREA = int(os.getenv('WAN_SINGLE_DEFAULT_MAX_AREA', str(832 * 480)))
DEFAULT_FIRST_LAST_MAX_AREA = int(os.getenv('WAN_FIRST_LAST_DEFAULT_MAX_AREA', str(832 * 480)))
RESOLUTION_PROFILES = {
  'small 480p-ish': 832 * 480,
  'balanced 720p-ish': 1280 * 720,
}
RESOLUTION_PROFILE_ALIASES = {
  '480P profile': 'small 480p-ish',
  '720P profile': 'balanced 720p-ish',
}
RESOLUTION_PROFILE_CHOICES = list(RESOLUTION_PROFILES.keys()) + list(RESOLUTION_PROFILE_ALIASES.keys())
SINGLE_PRESETS = {
  'low': {'num_frames': 33, 'fps': 12, 'steps': 16, 'guidance': 4.0, 'max_area': 832 * 480},
  'mid': {'num_frames': 49, 'fps': 16, 'steps': 24, 'guidance': 5.0, 'max_area': 832 * 480},
  'high': {'num_frames': 65, 'fps': 16, 'steps': 32, 'guidance': 5.5, 'max_area': 1280 * 720},
}
FIRST_LAST_PRESETS = {
  'low': {'num_frames': 33, 'fps': 12, 'steps': 16, 'guidance': 3.5, 'max_area': 832 * 480},
  'mid': {'num_frames': 49, 'fps': 16, 'steps': 24, 'guidance': 4.0, 'max_area': 832 * 480},
  'high': {'num_frames': 65, 'fps': 16, 'steps': 32, 'guidance': 5.0, 'max_area': 1280 * 720},
}
KEEP_BOTH_PIPELINES = os.getenv('WAN_KEEP_BOTH_PIPELINES', '0').strip().lower() in {'1', 'true', 'yes', 'on'}

loaded_pipelines = {
  'single': {
    'pipe': None,
    'model_id': None,
  },
  'first_last': {
    'pipe': None,
    'model_id': None,
  },
}


def aspect_ratio_resize(image, max_area):
  width, height = image.size
  aspect_ratio = height / width
  target_height = max(16, int(round(math.sqrt(max_area * aspect_ratio) / 16) * 16))
  target_width = max(16, int(round(math.sqrt(max_area / aspect_ratio) / 16) * 16))
  return image.resize((target_width, target_height), Image.LANCZOS), target_height, target_width


def unload_pipeline(mode=None):
  modes = [mode] if mode else list(loaded_pipelines.keys())
  for current_mode in modes:
    pipeline_state = loaded_pipelines[current_mode]
    if pipeline_state['pipe'] is not None:
      del pipeline_state['pipe']
      pipeline_state['pipe'] = None
    pipeline_state['model_id'] = None
  gc.collect()
  if torch.cuda.is_available():
    torch.cuda.empty_cache()


def ensure_pipeline(model_id, mode):
  normalized_mode = 'first_last' if mode == 'first_last' else 'single'
  pipeline_state = loaded_pipelines[normalized_mode]
  current_pipe = pipeline_state['pipe']
  current_model_id = pipeline_state['model_id']

  if current_pipe is not None and current_model_id == model_id:
    return current_pipe

  if not torch.cuda.is_available():
    raise gr.Error(
      'No GPU is available. In your Hugging Face Space, open Settings > Hardware and switch to ZeroGPU or a paid GPU.'
    )

  if not KEEP_BOTH_PIPELINES:
    unload_pipeline()
  else:
    unload_pipeline(normalized_mode)

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
  pipeline_state['pipe'] = pipe
  pipeline_state['model_id'] = model_id
  return pipe


def preset_values(preset_table, level):
  preset = preset_table[level]
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


def first_last_preset_values(level):
  preset = FIRST_LAST_PRESETS[level]
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


def compute_seed(seed, randomize_seed):
  return int(torch.seed() % 1000000) if randomize_seed else int(seed)


def normalize_resolution_profile(value):
  normalized = str(value or '').strip()
  if normalized in RESOLUTION_PROFILES:
    return normalized
  if normalized in RESOLUTION_PROFILE_ALIASES:
    return RESOLUTION_PROFILE_ALIASES[normalized]
  return 'small 480p-ish'


def resolve_single_model_selection(model_preset='', custom_model_id='', resolution_profile='small 480p-ish', custom_max_area=0):
  normalized_profile = normalize_resolution_profile(resolution_profile)
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else RESOLUTION_PROFILES[normalized_profile]
  normalized_custom_model_id = str(custom_model_id or '').strip()
  if normalized_custom_model_id:
    return {
      'model_id': normalized_custom_model_id,
      'resolution_profile': normalized_profile,
      'max_area': resolved_max_area,
    }

  preset_name = str(model_preset or '').strip() or DEFAULT_SINGLE_MODEL_PRESET
  preset = MODEL_PRESETS.get(preset_name)
  if preset is None:
    return {
      'model_id': DEFAULT_SINGLE_CUSTOM_MODEL_ID or DEFAULT_SINGLE_MODEL_ID,
      'resolution_profile': normalized_profile,
      'max_area': resolved_max_area,
    }

  return {
    'model_id': preset['model_id'],
    'resolution_profile': normalized_profile,
    'max_area': resolved_max_area or preset['max_area'],
  }


def build_status(label, diagnostic):
  print(f'[{label}] {json.dumps(diagnostic, ensure_ascii=True)}')
  return (
    f"{label}: `{diagnostic['model_id']}` at `{diagnostic['width']}x{diagnostic['height']}`, "
    f"`{diagnostic['actual_frames']}` actual frames (`{diagnostic['requested_frames']}` requested), "
    f"`{diagnostic['fps']}` fps, `{diagnostic['steps']}` steps, guidance `{diagnostic['guidance']:.1f}`, "
    f"seed `{diagnostic['seed']}`."
  )


@spaces.GPU
def generate_single_image_video(
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

  resolved_model_id = (model_id or DEFAULT_SINGLE_MODEL_ID).strip() or DEFAULT_SINGLE_MODEL_ID
  resolved_profile = normalize_resolution_profile(resolution_profile)
  pipeline = ensure_pipeline(resolved_model_id, 'single')
  image = image.convert('RGB')
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else RESOLUTION_PROFILES[resolved_profile]
  image, height, width = aspect_ratio_resize(image, max_area=resolved_max_area)
  resolved_seed = compute_seed(seed, randomize_seed)
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

  frames = getattr(result, 'frames', None)
  actual_frames = len(frames[0]) if frames is not None and len(frames) > 0 else 0
  if actual_frames <= 0:
    raise gr.Error('Wan image-video did not return any frames.')
  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  export_to_video(frames[0], output_path, fps=int(fps))
  return output_path, build_status('wan-mixed single', {
    'model_id': resolved_model_id,
    'width': width,
    'height': height,
    'requested_frames': int(num_frames),
    'actual_frames': actual_frames,
    'fps': int(fps),
    'steps': int(num_inference_steps),
    'guidance': float(guidance_scale),
    'seed': resolved_seed,
  })


def generate_video_safe(*args):
  try:
    # Backward-compatible wan-s style payload:
    # image, execution_mode, model_preset, custom_model_id, resolution_profile,
    # custom_max_area, prompt, negative_prompt, num_frames, num_inference_steps,
    # guidance_scale, fps, seed, randomize_seed, endpoint_url, endpoint_token,
    # endpoint_payload_template
    if len(args) >= 17:
      image = args[0]
      model_preset = args[2]
      custom_model_id = args[3]
      resolution_profile = args[4]
      custom_max_area = args[5]
      prompt = args[6]
      negative_prompt = args[7]
      num_frames = args[8]
      num_inference_steps = args[9]
      guidance_scale = args[10]
      fps = args[11]
      seed = args[12]
      randomize_seed = args[13]
      selection = resolve_single_model_selection(
        model_preset=model_preset,
        custom_model_id=custom_model_id,
        resolution_profile=resolution_profile or 'small 480p-ish',
        custom_max_area=custom_max_area,
      )
      return generate_single_image_video(
        image,
        selection['model_id'],
        prompt,
        negative_prompt,
        num_frames,
        num_inference_steps,
        guidance_scale,
        fps,
        seed,
        randomize_seed,
        selection['resolution_profile'],
        selection['max_area'],
      )

    # Native wan-mixed UI / API payload.
    if len(args) == 12:
      return generate_single_image_video(*args)

    raise gr.Error(f'Unsupported generate_video_safe input shape: {len(args)} arguments')
  except gr.Error as exc:
    return None, f'Error: {exc}'
  except Exception as exc:
    return None, f'Error: {exc}'


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

  resolved_model_id = (model_id or DEFAULT_FIRST_LAST_MODEL_ID).strip() or DEFAULT_FIRST_LAST_MODEL_ID
  pipeline = ensure_pipeline(resolved_model_id, 'first_last')
  first_image = first_image.convert('RGB')
  last_image = last_image.convert('RGB')
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else DEFAULT_FIRST_LAST_MAX_AREA
  first_image, height, width = aspect_ratio_resize(first_image, max_area=resolved_max_area)
  last_image = last_image.resize((width, height), Image.LANCZOS)
  resolved_seed = compute_seed(seed, randomize_seed)
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

  frames = getattr(result, 'frames', None)
  actual_frames = len(frames[0]) if frames is not None and len(frames) > 0 else 0
  if actual_frames <= 0:
    raise gr.Error('Wan first-last did not return any frames.')
  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  export_to_video(frames[0], output_path, fps=int(fps))
  return output_path, build_status('wan-mixed first-last', {
    'model_id': resolved_model_id,
    'width': width,
    'height': height,
    'requested_frames': int(num_frames),
    'actual_frames': actual_frames,
    'fps': int(fps),
    'steps': int(num_inference_steps),
    'guidance': float(guidance_scale),
    'seed': resolved_seed,
  })


with gr.Blocks(theme=gr.themes.Soft(), title='Wan Mixed') as demo:
  gr.Markdown(
    '''
    # Wan Mixed
    One Hugging Face Space with two compatible Wan endpoints:

    - `single-image` via `/generate_video_safe`
    - `first-last` via `/generate_video`
    '''
  )

  with gr.Tab('Single Image'):
    with gr.Row():
      with gr.Column():
        single_image_input = gr.Image(type='pil', label='Start frame')
        single_execution_mode_input = gr.Textbox(value='Local GPU', visible=False)
        single_model_preset_input = gr.Textbox(value=DEFAULT_SINGLE_MODEL_PRESET, visible=False)
        single_model_id_input = gr.Textbox(label='Model repo ID', value=DEFAULT_SINGLE_CUSTOM_MODEL_ID)
        single_prompt_input = gr.Textbox(
          label='Prompt',
          lines=4,
          value='Natural motion, strong subject continuity, realistic lighting, stable background, coherent body movement.',
        )
        single_negative_prompt_input = gr.Textbox(
          label='Negative prompt',
          lines=2,
          value='flicker, jitter, sudden scene change, warped anatomy, melting face, broken background',
        )
        with gr.Row():
          single_num_frames_input = gr.Slider(17, 121, value=SINGLE_PRESETS['mid']['num_frames'], step=4, label='Frames')
          single_fps_input = gr.Slider(8, 24, value=SINGLE_PRESETS['mid']['fps'], step=1, label='Output fps')
        with gr.Row():
          single_steps_input = gr.Slider(8, 60, value=SINGLE_PRESETS['mid']['steps'], step=1, label='Inference steps')
          single_guidance_input = gr.Slider(1.0, 8.0, value=SINGLE_PRESETS['mid']['guidance'], step=0.5, label='Guidance scale')
        with gr.Row():
          single_seed_input = gr.Slider(0, 999999, value=42, step=1, label='Seed')
          single_randomize_seed_input = gr.Checkbox(value=False, label='Randomize seed')
        single_resolution_profile_input = gr.Radio(RESOLUTION_PROFILE_CHOICES, value='small 480p-ish', label='Resolution profile')
        single_custom_max_area_input = gr.Number(label='Custom max area (optional)', value=DEFAULT_SINGLE_MAX_AREA, precision=0)
        single_endpoint_url_input = gr.Textbox(value='', visible=False)
        single_endpoint_token_input = gr.Textbox(value='', visible=False)
        single_endpoint_payload_template_input = gr.Textbox(value='', visible=False)
        with gr.Row():
          single_low_button = gr.Button('Low')
          single_mid_button = gr.Button('Mid', variant='primary')
          single_high_button = gr.Button('High')
        single_preset_output = gr.Markdown('Preset: `Mid`')
        single_generate_button = gr.Button('Generate single-image video', variant='primary')
      with gr.Column():
        single_video_output = gr.Video(label='Output video', autoplay=True)
        single_status_output = gr.Markdown('No run yet.')

  with gr.Tab('First Last'):
    with gr.Row():
      with gr.Column():
        first_image_input = gr.Image(type='pil', label='Start frame')
        last_image_input = gr.Image(type='pil', label='End frame')
        first_last_model_id_input = gr.Textbox(label='Model repo ID', value=DEFAULT_FIRST_LAST_MODEL_ID)
        first_last_prompt_input = gr.Textbox(
          label='Prompt',
          lines=4,
          value='Smooth transition, coherent motion, natural lighting, detailed subject consistency, high quality.',
        )
        first_last_negative_prompt_input = gr.Textbox(
          label='Negative prompt',
          lines=2,
          value='blurry, flicker, jitter, warped anatomy, melting details, sudden scene changes',
        )
        with gr.Row():
          first_last_num_frames_input = gr.Slider(33, 121, value=FIRST_LAST_PRESETS['mid']['num_frames'], step=4, label='Frames')
          first_last_fps_input = gr.Slider(8, 24, value=FIRST_LAST_PRESETS['mid']['fps'], step=1, label='Output fps')
        with gr.Row():
          first_last_steps_input = gr.Slider(8, 60, value=FIRST_LAST_PRESETS['mid']['steps'], step=1, label='Inference steps')
          first_last_guidance_input = gr.Slider(1.0, 8.0, value=FIRST_LAST_PRESETS['mid']['guidance'], step=0.5, label='Guidance scale')
        with gr.Row():
          first_last_seed_input = gr.Slider(0, 999999, value=42, step=1, label='Seed')
          first_last_randomize_seed_input = gr.Checkbox(value=False, label='Randomize seed')
        first_last_custom_max_area_input = gr.Number(label='Custom max area (optional)', value=DEFAULT_FIRST_LAST_MAX_AREA, precision=0)
        with gr.Row():
          first_last_low_button = gr.Button('Low')
          first_last_mid_button = gr.Button('Mid', variant='primary')
          first_last_high_button = gr.Button('High')
        first_last_preset_output = gr.Markdown('Preset: `Mid`')
        first_last_generate_button = gr.Button('Generate first-last video', variant='primary')
      with gr.Column():
        first_last_video_output = gr.Video(label='Output video', autoplay=True)
        first_last_status_output = gr.Markdown('No run yet.')

  single_low_button.click(
    fn=lambda: preset_values(SINGLE_PRESETS, 'low'),
    outputs=[single_num_frames_input, single_fps_input, single_steps_input, single_guidance_input, single_resolution_profile_input, single_custom_max_area_input, single_preset_output, single_low_button, single_mid_button, single_high_button],
  )
  single_mid_button.click(
    fn=lambda: preset_values(SINGLE_PRESETS, 'mid'),
    outputs=[single_num_frames_input, single_fps_input, single_steps_input, single_guidance_input, single_resolution_profile_input, single_custom_max_area_input, single_preset_output, single_low_button, single_mid_button, single_high_button],
  )
  single_high_button.click(
    fn=lambda: preset_values(SINGLE_PRESETS, 'high'),
    outputs=[single_num_frames_input, single_fps_input, single_steps_input, single_guidance_input, single_resolution_profile_input, single_custom_max_area_input, single_preset_output, single_low_button, single_mid_button, single_high_button],
  )

  first_last_low_button.click(
    fn=lambda: first_last_preset_values('low'),
    outputs=[first_last_num_frames_input, first_last_fps_input, first_last_steps_input, first_last_guidance_input, first_last_custom_max_area_input, first_last_preset_output, first_last_low_button, first_last_mid_button, first_last_high_button],
  )
  first_last_mid_button.click(
    fn=lambda: first_last_preset_values('mid'),
    outputs=[first_last_num_frames_input, first_last_fps_input, first_last_steps_input, first_last_guidance_input, first_last_custom_max_area_input, first_last_preset_output, first_last_low_button, first_last_mid_button, first_last_high_button],
  )
  first_last_high_button.click(
    fn=lambda: first_last_preset_values('high'),
    outputs=[first_last_num_frames_input, first_last_fps_input, first_last_steps_input, first_last_guidance_input, first_last_custom_max_area_input, first_last_preset_output, first_last_low_button, first_last_mid_button, first_last_high_button],
  )

  single_generate_button.click(
    fn=generate_video_safe,
    inputs=[
      single_image_input,
      single_execution_mode_input,
      single_model_preset_input,
      single_model_id_input,
      single_resolution_profile_input,
      single_custom_max_area_input,
      single_prompt_input,
      single_negative_prompt_input,
      single_num_frames_input,
      single_steps_input,
      single_guidance_input,
      single_fps_input,
      single_seed_input,
      single_randomize_seed_input,
      single_endpoint_url_input,
      single_endpoint_token_input,
      single_endpoint_payload_template_input,
    ],
    outputs=[single_video_output, single_status_output],
    api_name='generate_video_safe',
  )

  first_last_generate_button.click(
    fn=generate_video,
    inputs=[
      first_image_input,
      last_image_input,
      first_last_model_id_input,
      first_last_prompt_input,
      first_last_negative_prompt_input,
      first_last_num_frames_input,
      first_last_steps_input,
      first_last_guidance_input,
      first_last_fps_input,
      first_last_seed_input,
      first_last_randomize_seed_input,
      first_last_custom_max_area_input,
    ],
    outputs=[first_last_video_output, first_last_status_output],
    api_name='generate_video',
  )


if __name__ == '__main__':
  demo.launch()
