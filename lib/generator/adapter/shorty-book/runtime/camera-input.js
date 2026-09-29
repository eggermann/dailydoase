import path from 'node:path';

import { createRemoteImageLoader } from '../LiveContextOrchestrator-remote-images.js';

/**
 * Camera/reference input boundary.
 *
 * The live loop only needs two decisions here: which scene context images are
 * available, and which protagonist image should open the iteration.
 */
export const createCameraInputController = ({
  camera,
  sceneContextImage,
  cameraOutputDir,
  captureWebcamImage,
} = {}) => {
  const remoteImageLoader = createRemoteImageLoader({
    cacheDir: path.join(cameraOutputDir, '.remote-camera-cache'),
  });
  let remoteCameraImageCursor = 0;

  const getRemoteCameraImagePath = (imageUrl, imageIndex) => remoteImageLoader.buildPath(imageUrl, imageIndex, 'camera');
  const getRemoteProtagonistImagePath = (imageUrl) => remoteImageLoader.buildPath(imageUrl, 0, 'protagonist');
  const getRemoteSceneContextImagePath = (imageUrl, imageIndex) => remoteImageLoader.buildPath(imageUrl, imageIndex, 'scene-context');
  const downloadRemoteImageToCache = async (imageUrl, imagePath) => remoteImageLoader.ensureCached(imageUrl, imagePath);
  const buildFolderImagesApiUrl = (folderUrl) => {
    const resolvedFolderUrl = String(folderUrl || '').trim();
    return resolvedFolderUrl ? `https://dailydoase.de/api/folder-images?url=${encodeURIComponent(resolvedFolderUrl)}` : '';
  };

  const loadSceneContextImageUrls = async () => remoteImageLoader.loadFolderImages({
    apiUrl: sceneContextImage.apiUrl || buildFolderImagesApiUrl(sceneContextImage.folderUrl),
    explicitUrls: sceneContextImage.urls.filter(Boolean),
    startAfterImageFile: sceneContextImage.startAfterProtagonist && camera.protagonistImageUrl
      ? path.basename(new URL(camera.protagonistImageUrl).pathname)
      : '',
  });

  const resolveSceneContextImages = async ({ sceneCount = 0 } = {}) => {
    if (!sceneContextImage.enabled) return [];
    const urls = await loadSceneContextImageUrls();
    if (urls.length === 0) return [];

    const count = Math.max(1, Number(sceneCount) || urls.length);
    const entries = [];
    for (let index = 0; index < count; index += 1) {
      const imageUrl = urls[index % urls.length];
      const imagePath = getRemoteSceneContextImagePath(imageUrl, index);
      await downloadRemoteImageToCache(imageUrl, imagePath);
      entries.push({
        index: index + 1,
        url: imageUrl,
        path: imagePath,
        source: `scene-context-${(index % urls.length) + 1}`,
      });
    }
    return entries;
  };

  const resolveConfiguredCameraImage = async () => {
    if (camera.protagonistImageUrl) {
      const imageUrl = camera.protagonistImageUrl;
      const imagePath = getRemoteProtagonistImagePath(imageUrl);
      await downloadRemoteImageToCache(imageUrl, imagePath);
      return { imagePath, imageSource: 'protagonist-reference-url' };
    }

    if (camera.imageUrls.length > 0) {
      const imageIndex = remoteCameraImageCursor;
      remoteCameraImageCursor += 1;
      const imageUrl = camera.imageUrls[imageIndex % camera.imageUrls.length];
      const imagePath = getRemoteCameraImagePath(imageUrl, imageIndex);
      await downloadRemoteImageToCache(imageUrl, imagePath);
      return {
        imagePath,
        imageSource: `remote-image-${(imageIndex % camera.imageUrls.length) + 1}`,
      };
    }

    if (camera.imagePath) {
      return { imagePath: path.resolve(camera.imagePath), imageSource: 'configured' };
    }

    return {
      imagePath: await captureWebcamImage({
        cameraOutputDir: camera.outputDir,
        cameraFallbackImagePath: camera.fallbackImagePath,
        captureOptions: {
          width: camera.width,
          height: camera.height,
          quality: camera.quality,
          warmupSeconds: camera.warmupSeconds,
          output: 'jpeg',
          extension: 'jpg',
          device: camera.device,
        },
      }),
      imageSource: 'captured',
    };
  };

  return { resolveSceneContextImages, resolveConfiguredCameraImage };
};

export default createCameraInputController;
