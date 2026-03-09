import gc
import base64
import io
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
import requests
import torch
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
from diffusers.utils import export_to_video
from PIL import Image
from transformers import CLIPVisionModel


MODEL_PRESETS = {
  'Wan 2.1 I2V 480P (official)': {
    'model_id': 'Wan-AI/Wan2.1-I2V-14B-480P-Diffusers',
    'max_area': 832 * 480,
    'description': 'Fastest official I2V preset for a first test.',
  },
  'Wan 2.1 I2V 720P (official)': {
    'model_id': 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers',
    'max_area': 1280 * 720,
    'description': 'Higher resolution, slower and heavier.',
  },
  'Wan 2.2 I2V A14B (official)': {
    'model_id': 'Wan-AI/Wan2.2-I2V-A14B-Diffusers',
    'max_area': 1280 * 720,
    'description': 'Newer official Wan I2V model, heavier than 480P.',
  },
}
RESOLUTION_PROFILES = {
  '480P profile': 832 * 480,
  '720P profile': 1280 * 720,
}
DEFAULT_SETTINGS = {
  'low': {
    'num_frames': 33,
    'fps': 8,
    'steps': 8,
    'guidance': 1.0,
    'resolution_profile': '480P profile',
    'max_area': 832 * 480,
  },
  'mid': {
    'num_frames': 65,
    'fps': 16,
    'steps': 16,
    'guidance': 3.5,
    'resolution_profile': '480P profile',
    'max_area': 832 * 480,
  },
  'high': {
    'num_frames': 81,
    'fps': 16,
    'steps': 28,
    'guidance': 5.0,
    'resolution_profile': '720P profile',
    'max_area': 1280 * 720,
  },
}
DEFAULT_PRESET = os.getenv('WAN_MODEL_PRESET', 'Wan 2.1 I2V 480P (official)')
DEFAULT_RESOLUTION_PROFILE = '480P profile'
FPS = 16

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


def get_model_config(selected_preset, custom_model_id, resolution_profile, custom_max_area=0):
  custom_model_id = (custom_model_id or '').strip()
  resolved_max_area = int(custom_max_area) if custom_max_area and int(custom_max_area) > 0 else RESOLUTION_PROFILES[resolution_profile]
  if custom_model_id:
    return {
      'label': f'Custom: {custom_model_id}',
      'model_id': custom_model_id,
      'max_area': resolved_max_area,
      'description': 'Custom repo ID using the selected resolution profile.',
    }

  if selected_preset not in MODEL_PRESETS:
    raise gr.Error('Select a model preset or enter a custom model repo ID.')

  preset = MODEL_PRESETS[selected_preset]
  return {
    'label': selected_preset,
    'model_id': preset['model_id'],
    'max_area': resolved_max_area or preset['max_area'],
    'description': preset['description'],
  }


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


def describe_selection(selected_preset, custom_model_id, resolution_profile, custom_max_area):
  config = get_model_config(selected_preset, custom_model_id, resolution_profile, custom_max_area)
  return (
    f"Selected model: `{config['model_id']}`\n\n"
    f"Resize profile: `{resolution_profile}`\n\n"
    f"Max area: `{config['max_area']}`\n\n"
    f"{config['description']}"
  )


def preset_values(level, selected_preset, custom_model_id):
  preset = DEFAULT_SETTINGS[level]
  selection_text = describe_selection(
    selected_preset,
    custom_model_id,
    preset['resolution_profile'],
    preset['max_area'],
  )
  low_variant = 'primary' if level == 'low' else 'secondary'
  mid_variant = 'primary' if level == 'mid' else 'secondary'
  high_variant = 'primary' if level == 'high' else 'secondary'
  return (
    gr.update(value=preset['num_frames']),
    gr.update(value=preset['fps']),
    gr.update(value=preset['steps']),
    gr.update(value=preset['guidance']),
    gr.update(value=preset['resolution_profile']),
    gr.update(value=preset['max_area']),
    f"Preset: `{level.capitalize()}`",
    selection_text,
    gr.update(variant=low_variant),
    gr.update(variant=mid_variant),
    gr.update(variant=high_variant),
  )


def image_to_base64(image):
  buffer = io.BytesIO()
  image.save(buffer, format='PNG')
  return base64.b64encode(buffer.getvalue()).decode('utf-8')


def save_video_bytes(video_bytes):
  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  with open(output_path, 'wb') as output_file:
    output_file.write(video_bytes)
  return output_path


def extract_video_from_response(response):
  content_type = response.headers.get('content-type', '')
  if content_type.startswith('video/'):
    return save_video_bytes(response.content)

  payload = response.json()

  if isinstance(payload, str) and payload.startswith('http'):
    return payload

  for key in ['video_url', 'url', 'output_url']:
    value = payload.get(key)
    if isinstance(value, str) and value:
      return value

  nested_output = payload.get('output')
  if isinstance(nested_output, dict):
    for key in ['video_url', 'url', 'output_url']:
      value = nested_output.get(key)
      if isinstance(value, str) and value:
        return value

  for key in ['video_base64', 'output_base64']:
    value = payload.get(key)
    if isinstance(value, str) and value:
      return save_video_bytes(base64.b64decode(value))

  if isinstance(nested_output, dict):
    for key in ['video_base64', 'output_base64']:
      value = nested_output.get(key)
      if isinstance(value, str) and value:
        return save_video_bytes(base64.b64decode(value))

  raise gr.Error(
    'The endpoint response did not contain a supported video output. Supported keys: video_url, url, output.video_url, video_base64.'
  )


def call_remote_endpoint(
  image,
  endpoint_url,
  endpoint_token,
  selected_preset,
  custom_model_id,
  resolution_profile,
  custom_max_area,
  prompt,
  negative_prompt,
  num_frames,
  num_inference_steps,
  guidance_scale,
  fps,
  seed,
  randomize_seed,
  endpoint_payload_template,
):
  endpoint_url = (endpoint_url or '').strip()
  if not endpoint_url:
    raise gr.Error('Enter a remote endpoint URL.')

  config = get_model_config(selected_preset, custom_model_id, resolution_profile, custom_max_area)
  image = image.convert('RGB')
  image, height, width = aspect_ratio_resize(image, config['max_area'])

  resolved_seed = int(torch.seed() % 1000000) if randomize_seed else int(seed)
  payload = {
    'inputs': {
      'prompt': prompt,
      'negative_prompt': negative_prompt or None,
      'image_base64': image_to_base64(image),
      'height': height,
      'width': width,
      'num_frames': int(num_frames),
      'num_inference_steps': int(num_inference_steps),
      'guidance_scale': float(guidance_scale),
      'fps': int(fps),
      'seed': resolved_seed,
      'model_id': config['model_id'],
    }
  }

  template_text = (endpoint_payload_template or '').strip()
  if template_text:
    try:
      template_payload = json.loads(template_text)
    except json.JSONDecodeError as exc:
      raise gr.Error(f'Endpoint payload template is not valid JSON: {exc}') from exc
    payload.update(template_payload)

  headers = {'Content-Type': 'application/json'}
  if endpoint_token:
    headers['Authorization'] = f'Bearer {endpoint_token.strip()}'

  response = requests.post(endpoint_url, headers=headers, json=payload, timeout=600)
  try:
    response.raise_for_status()
  except requests.HTTPError as exc:
    body = response.text[:1000]
    raise gr.Error(f'Endpoint request failed: {response.status_code} {body}') from exc

  video_result = extract_video_from_response(response)
  return video_result, (
    f"Generated via remote endpoint `{endpoint_url}` with model `{config['model_id']}` at `{width}x{height}`, `{int(num_frames)}` frames, `{int(fps)}` fps, seed `{resolved_seed}`."
  )


@spaces.GPU
def generate_video(
  image,
  execution_mode,
  selected_preset,
  custom_model_id,
  resolution_profile,
  custom_max_area,
  prompt,
  negative_prompt,
  num_frames,
  num_inference_steps,
  guidance_scale,
  fps,
  seed,
  randomize_seed,
  endpoint_url,
  endpoint_token,
  endpoint_payload_template,
):
  if image is None:
    raise gr.Error('Upload an image first.')

  if execution_mode == 'Remote endpoint':
    return call_remote_endpoint(
      image,
      endpoint_url,
      endpoint_token,
      selected_preset,
      custom_model_id,
      resolution_profile,
      custom_max_area,
      prompt,
      negative_prompt,
      num_frames,
      num_inference_steps,
      guidance_scale,
      fps,
      seed,
      randomize_seed,
      endpoint_payload_template,
    )

  config = get_model_config(selected_preset, custom_model_id, resolution_profile, custom_max_area)
  pipeline = ensure_pipeline(config['model_id'])
  image = image.convert('RGB')
  image, height, width = aspect_ratio_resize(image, config['max_area'])

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

  output_path = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
  export_to_video(result.frames[0], output_path, fps=int(fps))
  return output_path, (
    f"Generated with `{config['model_id']}` at `{width}x{height}`, `{int(num_frames)}` frames, `{int(fps)}` fps, seed `{resolved_seed}`."
  )


def generate_video_safe(*args):
  try:
    return generate_video(*args)
  except gr.Error as exc:
    return None, f"Error: {exc}"
  except Exception as exc:
    return None, f"Error: {exc}"


with gr.Blocks(theme=gr.themes.Soft(), title='Wan S') as demo:
  gr.Markdown(
    '''
    # Wan S
    Own-hosted Wan image-to-video Space with switchable model endpoints.

    Pick `Local GPU` to load a model inside this Space, or `Remote endpoint` to call your own hosted endpoint.
    Official Wan presets and custom model repo IDs are supported in both modes.
    '''
  )

  with gr.Row():
    with gr.Column():
      image_input = gr.Image(type='pil', label='Input image')
      execution_mode_input = gr.Radio(
        choices=['Local GPU', 'Remote endpoint'],
        value='Local GPU',
        label='Execution mode',
      )
      model_preset_input = gr.Dropdown(
        choices=list(MODEL_PRESETS.keys()),
        value=DEFAULT_PRESET if DEFAULT_PRESET in MODEL_PRESETS else list(MODEL_PRESETS.keys())[0],
        label='Model preset',
      )
      custom_model_input = gr.Textbox(
        label='Custom model repo ID',
        placeholder='Optional, for example: your-name/your-wan-diffusers-model',
      )
      resolution_profile_input = gr.Radio(
        choices=list(RESOLUTION_PROFILES.keys()),
        value=DEFAULT_RESOLUTION_PROFILE,
        label='Resolution profile',
      )
      custom_max_area_input = gr.Number(
        label='Custom max area (optional)',
        value=0,
        precision=0,
      )
      selection_output = gr.Markdown(
        value=describe_selection(
          DEFAULT_PRESET if DEFAULT_PRESET in MODEL_PRESETS else list(MODEL_PRESETS.keys())[0],
          '',
          DEFAULT_RESOLUTION_PROFILE,
          0,
        )
      )
      endpoint_url_input = gr.Textbox(
        label='Remote endpoint URL',
        placeholder='Optional. Example: https://your-endpoint.endpoints.huggingface.cloud',
      )
      endpoint_token_input = gr.Textbox(
        label='Remote endpoint token',
        placeholder='Optional bearer token for protected endpoints',
        type='password',
      )
      endpoint_payload_template_input = gr.Code(
        label='Extra endpoint payload JSON',
        language='json',
        value='',
      )
      prompt_input = gr.Textbox(
        label='Prompt',
        lines=4,
        value='Natural motion, one clear camera move, stable subject, realistic lighting, coherent documentary-style animation.',
      )
      negative_prompt_input = gr.Textbox(
        label='Negative prompt',
        lines=2,
        value='blurry, flicker, jitter, warped anatomy, melting details, sudden scene changes',
      )
      with gr.Row():
        num_frames_input = gr.Slider(33, 121, value=33, step=4, label='Frames')
        fps_input = gr.Slider(8, 24, value=8, step=1, label='Output fps')
      with gr.Row():
        steps_input = gr.Slider(8, 60, value=8, step=1, label='Inference steps')
        guidance_input = gr.Slider(1.0, 8.0, value=1.0, step=0.5, label='Guidance scale')
      with gr.Row():
        seed_input = gr.Slider(0, 999999, value=0, step=1, label='Seed')
        randomize_seed_input = gr.Checkbox(value=False, label='Randomize seed')
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
        - `Local GPU` runs inside this Space and needs ZeroGPU or a paid GPU.
        - `Remote endpoint` sends a JSON request and does not use this Space GPU for generation.
        - `480P` is the safest starting point.
        - Use `720P` only after the smaller model works.
        - `65` frames at `16 fps` is a good balanced default.
        - Lower guidance gives more natural motion; higher guidance follows the prompt more strictly.
        - `Custom max area` lets you override the preset resolution budget directly.
        - If you enter a custom repo ID, it must be a Diffusers-compatible Wan image-to-video repo.
        - The remote endpoint response can be raw MP4 bytes or JSON with `video_url`, `url`, `output.video_url`, or `video_base64`.
        - Switching models unloads the previous pipeline to free VRAM.
        '''
      )

  for component in [model_preset_input, custom_model_input, resolution_profile_input, custom_max_area_input]:
    component.change(
      fn=describe_selection,
      inputs=[model_preset_input, custom_model_input, resolution_profile_input, custom_max_area_input],
      outputs=selection_output,
    )

  low_button.click(
    fn=lambda selected_preset, custom_model_id: preset_values('low', selected_preset, custom_model_id),
    inputs=[model_preset_input, custom_model_input],
    outputs=[
      num_frames_input,
      fps_input,
      steps_input,
      guidance_input,
      resolution_profile_input,
      custom_max_area_input,
      preset_output,
      selection_output,
      low_button,
      mid_button,
      high_button,
    ],
  )
  mid_button.click(
    fn=lambda selected_preset, custom_model_id: preset_values('mid', selected_preset, custom_model_id),
    inputs=[model_preset_input, custom_model_input],
    outputs=[
      num_frames_input,
      fps_input,
      steps_input,
      guidance_input,
      resolution_profile_input,
      custom_max_area_input,
      preset_output,
      selection_output,
      low_button,
      mid_button,
      high_button,
    ],
  )
  high_button.click(
    fn=lambda selected_preset, custom_model_id: preset_values('high', selected_preset, custom_model_id),
    inputs=[model_preset_input, custom_model_input],
    outputs=[
      num_frames_input,
      fps_input,
      steps_input,
      guidance_input,
      resolution_profile_input,
      custom_max_area_input,
      preset_output,
      selection_output,
      low_button,
      mid_button,
      high_button,
    ],
  )

  generate_button.click(
    fn=generate_video_safe,
    inputs=[
      image_input,
      execution_mode_input,
      model_preset_input,
      custom_model_input,
      resolution_profile_input,
      custom_max_area_input,
      prompt_input,
      negative_prompt_input,
      num_frames_input,
      steps_input,
      guidance_input,
      fps_input,
      seed_input,
      randomize_seed_input,
      endpoint_url_input,
      endpoint_token_input,
      endpoint_payload_template_input,
    ],
    outputs=[video_output, status_output],
  )


if __name__ == '__main__':
  demo.launch()
