import huggingface_hub as hf_hub
# Shim missing APIs removed in huggingface_hub >= 0.26.0
if not hasattr(hf_hub, "cached_download"):
    hf_hub.cached_download = hf_hub.hf_hub_download
if not hasattr(hf_hub, "model_info"):
    hf_hub.model_info = hf_hub.get_model_info

import gradio as gr
import torch
# Determine device: use GPU if available, otherwise CPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
# Choose dtype based on device
dtype = torch.float16 if device.type == "cuda" else torch.float32
import tempfile
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import export_to_video

# Use the official SVD-XT img2vid-xt model
MODEL = "stabilityai/stable-video-diffusion-img2vid-xt"

# Load pipeline in appropriate precision on GPU or CPU
pipe = StableVideoDiffusionPipeline.from_pretrained(
    MODEL, torch_dtype=dtype
).to(device)

def infer(first_image, last_image, prompt, guidance=7.5, frames=25):
    # Generate the in-between frames
    video = pipe(
        image=first_image,
        last_image=last_image,
        prompt=prompt,
        guidance_scale=guidance,
        num_frames=frames
    ).frames
    # Export to a temporary MP4 file
    mp4_path = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
    export_to_video(video, mp4_path, fps=15)
    return mp4_path  # Gradio will auto-encode to base64 for the API

# Build a minimal Gradio interface
demo = gr.Interface(
    fn=infer,
    inputs=[
        gr.Image(type="pil", label="Start frame"),
        gr.Image(type="pil", label="End frame"),
        gr.Textbox(placeholder="Prompt (optional)"),
        gr.Slider(0, 12, 7.5, label="Guidance scale"),
        gr.Slider(8, 48, 25, step=1, label="Num frames"),
    ],
    outputs="video",
    title="Eggman – 2-Frame SVD API"
)

# Enable the REST API
demo.queue(default_concurrency_limit=1).launch(show_api=True)
