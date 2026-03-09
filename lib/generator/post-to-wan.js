import { PostToWan22_5B_ImageVideo } from './image-video/wan22/imageVideo.js';

class LegacyPostToWan {
  constructor(modelConfig = {}) {
    this.impl = new PostToWan22_5B_ImageVideo(modelConfig);
  }

  async init() {
    await this.impl.init();
    return this;
  }

  async prompt(inputImageStream, options = {}) {
    const result = await this.impl.prompt(inputImageStream, options);
    return result?.file ?? result;
  }

  get _cli() {
    return this.impl?._cli;
  }

  get imageDir() {
    return this.impl?.imageDir;
  }

  set imageDir(value) {
    if (this.impl) {
      this.impl.imageDir = value;
    }
  }
}

export default {
  init: async (config = {}) => {
    return await (new LegacyPostToWan(config)).init();
  }
};
