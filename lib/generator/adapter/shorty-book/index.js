import Generator from './generator.js';

let cachedInstance = null;

export default {
  init: async (config) => {
    const instance = new Generator(config).init();

    return instance;
  }
  /*,
  get: async () => cachedInstance || (async (config={}) => {
       const instance = new PostToFLUX(config);
      cachedInstance = await instance.init();
      return cachedInstance;
  })(),*/
};
