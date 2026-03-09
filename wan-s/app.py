import math
import os
import tempfile
from functools import wraps

import gradio as gr
import torch
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
from diffusers.utils import export_to_video
from PIL import Image
from transformers import CLIPVisionModel

try:
  import spaces
except ImportError:
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


MODEL_ID = os.getenv('WAN_MODEL_ID', 'Wan-AI/Wan2.1-I2V-14B-480P-Diffusers')
MAX_AREA = 832 * 480
FPS = 16

pipe = None


def aspect_ratio_resize(image, max_area=MAX_AREA):
  width, height = image.size
  aspect_ratio = height / width
  target_height = int(round(math.sqrt(max_area * aspect_ratio) / 16) * 16)
  target_width = int(round(math.sqrt(max_area / aspect_ratio) / 16) * 16)
  return image.resize((target_width, target_height), Image.LANCZOS), target_height, target_width


def ensure_pipeline():
  global pipe

  if pipe is not None:
    return pipe

  if not torch.cuda.is_available():
    raise gr.Error(
      'No GPU is available. In your Hugging Face Space, open Settings > Hardware and switch to ZeroGPU or a paid GPU.'
    )

  torch_dtype = torch.bfloat16

  image_encoder = CLIPVisionModel.from_pretrained(
    MODEL_ID,
    subfolder='image_encoder',
    torch_dtype=torch.float32,
  )
  vae = AutoencoderKLWan.from_pretrained(
    MODEL_ID,
    subfolder='vae',
    torch_dtype=torch.float32,
  )
  pipe = WanImageToVideoPipeline.from_pretrained(
    MODEL_ID,
    image_encoder=image_encoder,
    vae=vae,
    torch_dtype=torch_dtype,
  )
  pipe.enable_model_cpu_offload()
  pipe.vae.enable_tiling()
  return pipe


@spaces.GPU
def generate_video(
  image,
  prompt,
  negative_prompt,
  num_frames,
  num_inference_steps,
  guidance_scale,
  seed,
):
  if image is None:
    raise gr.Error('Upload an image first.')

  pipeline = ensure_pipeline()
  image = image.convert('RGB')
  image, height, width = aspect_ratio_resize(image)

  generator = torch.Generator(device='cpu').manual_seed(int(seed))
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
  export_to_video(result.frames[0], output_path, fps=FPS)
  return output_path


with gr.Blocks(theme=gr.themes.Soft(), title='Wan S') as demo:
  gr.Markdown(
    '''
    # Wan S
    Upload one image and generate a short Wan image-to-video clip.

    This starter uses `Wan-AI/Wan2.1-I2V-14B-480P-Diffusers`. It needs a GPU Space.
    If generation fails with a hardware message, open `Settings -> Hardware` and choose `ZeroGPU` or a paid GPU.
    '''
  )

  with gr.Row():
    with gr.Column():
      image_input = gr.Image(type='pil', label='Input image')
      prompt_input = gr.Textbox(
        label='Prompt',
        lines=4,
        value='Cinematic motion, subtle camera movement, natural lighting, detailed subject motion, high quality.',
      )
      negative_prompt_input = gr.Textbox(
        label='Negative prompt',
        lines=2,
        value='blurry, distorted, low quality, flicker, warped anatomy',
      )
      with gr.Row():
        num_frames_input = gr.Slider(49, 81, value=49, step=4, label='Frames')
        steps_input = gr.Slider(20, 50, value=30, step=1, label='Inference steps')
      with gr.Row():
        guidance_input = gr.Slider(1.0, 7.5, value=5.0, step=0.5, label='Guidance scale')
        seed_input = gr.Slider(0, 999999, value=42, step=1, label='Seed')
      generate_button = gr.Button('Generate video', variant='primary')

    with gr.Column():
      video_output = gr.Video(label='Output video', autoplay=True)
      gr.Markdown(
        '''
        Tips:
        - Use a clear subject in the first frame.
        - Keep prompts specific but short.
        - 49 frames is faster and cheaper than 81.
        - If the queue is slow, that is normal on ZeroGPU.
        '''
      )

  generate_button.click(
    fn=generate_video,
    inputs=[
      image_input,
      prompt_input,
      negative_prompt_input,
      num_frames_input,
      steps_input,
      guidance_input,
      seed_input,
    ],
    outputs=video_output,
  )


if __name__ == '__main__':
  demo.launch()
