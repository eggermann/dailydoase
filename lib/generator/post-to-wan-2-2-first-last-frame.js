import { PostToWan22_5B_ImageVideo } from './wan22/imageVideo.js';
import { PostToWan22_FirstLastFrame } from './wan22/firstLastFrame.js';

export default {
  init: async (config = {}) => {
    return await new PostToWan22_5B_ImageVideo(config).init();
  }
};

export const initFirstLast = async (config = {}) => {
  return await new PostToWan22_FirstLastFrame(config).init();
};

