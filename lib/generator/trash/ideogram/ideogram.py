# run_ideogram.py

import sys
from ideogram_wrapper import IdeogramWrapper

# Retrieve command-line arguments
session_cookie_token = sys.argv[1]
prompt = sys.argv[2]
aspect_ratio = sys.argv[3]
output_dir = sys.argv[4]
enable_logging = sys.argv[5].lower() == 'true'  # Convert to boolean

# Create the IdeogramWrapper object with the provided arguments
ideogram = IdeogramWrapper(
    session_cookie_token=session_cookie_token,
    prompt=prompt,
    aspect_ratio=aspect_ratio,
    output_dir=output_dir,
    enable_logging=enable_logging
)

# Run the inference
image_path = ideogram.inference()

# Output the path of the generated image
print(image_path)