import { Image } from 'image-js';

const isBlackImage = async (options) => {
    try {
        let image;
        if (options.type === 'base64') {
            image = await Image.load(options.data);
        } else if (options.type === 'binary') {
            image = await Image.load(Buffer.from(options.data));
        } else {
            return false;
        }

        const histogram = image.getHistograms({ maxSlots: 16 });
        let channelSum = 0;
        histogram.forEach((rgb, index) => {
            channelSum += rgb.reduce((acc, val) => acc + val, 0);
        });
        return channelSum < 100;
    } catch (e) {
        console.log('isBlackImage err', e);
        return false;
    }
};

export default isBlackImage;
