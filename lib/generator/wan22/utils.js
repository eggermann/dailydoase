import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

// Anchor outputs inside this module directory (lib/generator/wan22)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const joinOutPath = (subPath) => path.join(__dirname, subPath);

export const toSharp = (src) => {
  if (typeof src === 'string') return sharp(src);
  if (src instanceof sharp) return src;
  if (Buffer.isBuffer(src)) return sharp(src);
  throw new Error('Unsupported image stream type');
};

export const downloadToFile = async (url, destPath) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.ensureDirSync(path.dirname(destPath));
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
  return destPath;
};

export const saveJsonSidecar = async (targetPath, data) => {
  const jsonPath = `${targetPath}.json`;
  await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
  return jsonPath;
};

// Infer output dimensions using the Space helper, with fallback defaults
export const inferDimsWithSpace = async (
  cli,
  tmpImagePath,
  h,
  w,
  defaultHeight,
  defaultWidth
) => {
  let height = h;
  let width = w;
  if (!height || !width) {
    try {
      const dimRes = await cli.predict('/handle_image_upload_for_dims_wan', {
        uploaded_pil_image: await fs.readFile(tmpImagePath),
        current_h_val: height ?? defaultHeight,
        current_w_val: width ?? defaultWidth,
      });
      if (Array.isArray(dimRes?.data) && dimRes.data.length >= 2) {
        height = Number(dimRes.data[0]) || (height ?? defaultHeight);
        width = Number(dimRes.data[1]) || (width ?? defaultWidth);
      } else {
        height = height ?? defaultHeight;
        width = width ?? defaultWidth;
      }
    } catch (_) {
      height = height ?? defaultHeight;
      width = width ?? defaultWidth;
    }
  }
  return { h: height, w: width };
};
