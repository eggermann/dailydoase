import gradio as gr
import torch
import numpy as np
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
from diffusers.utils import export_to_video, load_image
from transformers import CLIPVisionModel
from PIL import Image
import tempfile

# --- Load Model ---
model_id = "Wan-AI/Wan2.1-FLF2V-14B-720P-Diffusers"

image_encoder = CLIPVisionModel.from_pretrained(model_id, subfolder="image_encoder", torch_dtype=torch.float32)
vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
pipe = WanImageToVideoPipeline.from_pretrained(
    model_id, vae=vae, image_encoder=image_encoder, torch_dtype=torch.float16
)
pipe.to("cuda" if torch.cuda.is_available() else "cpu")

# --- Helper Functions ---
def aspect_ratio_resize(image, pipe, max_area=720 * 1280):
    aspect_ratio = image.height / image.width
    mod_value = pipe.vae_scale_factor_spatial * pipe.transformer.config.patch_size
    height = round(np.sqrt(max_area * aspect_ratio)) // mod_value * mod_value
    width = round(np.sqrt(max_area / aspect_ratio)) // mod_value * mod_value
    image = image.resize((width, height))
    return image, height, width

def center_crop_resize(image, height, width):
    import torchvision.transforms.functional as TF
    resize_ratio = max(width / image.width, height / image.height)
    width = round(image.width * resize_ratio)
    height = round(image.height * resize_ratio)
    size = [width, height]
    image = TF.center_crop(image, size)
    return image, height, width

# --- Gradio Inference Function ---
def infer(first_image, last_image, prompt, guidance=5.5, frames=25):
    # Convert to PIL
    if not isinstance(first_image, Image.Image):
        first_image = Image.fromarray(first_image)
    if not isinstance(last_image, Image.Image):
        last_image = Image.fromarray(last_image)

    # Resize/crop as needed
    first_image, height, width = aspect_ratio_resize(first_image, pipe)
    if last_image.size != first_image.size:
        last_image, _, _ = center_crop_resize(last_image, height, width)

    # Run pipeline
    output = pipe(
        image=first_image,
        last_image=last_image,
        prompt=prompt,
        height=height,
        width=width,
        guidance_scale=guidance,
        num_frames=frames,
    ).frames

    # Export to video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        export_to_video(output, tmp.name, fps=16)
        return tmp.name

# --- Gradio Interface ---
demo = gr.Interface(
    fn=infer,
    inputs=[
        gr.Image(type="pil", label="Start Frame"),
        gr.Image(type="pil", label="End Frame"),
        gr.Textbox(placeholder="Prompt (optional)", label="Prompt"),
        gr.Slider(3, 12, value=5.5, step=0.1, label="Guidance Scale"),
        gr.Slider(8, 48, value=25, step=1, label="Num Frames"),
    ],
    outputs=gr.Video(label="Generated Video"),
    title="WAN Two-Frame Video Interpolation",
    description="Upload two images and (optionally) a prompt to create a smooth video transition."
)

if __name__ == "__main__":
    demo.launch(show_api=True)