import breakpoints from './_.variables.breakpoints';

const _ = {
    leaveFkts: {},
    entryFkts: {},
    currentBp: '',
    keys: [],
    arrayIfy: someVar => typeof someVar === 'string' ? [someVar] : someVar,
    is: {},//is.sm =true||false
    isIn: (bp = 'md') => {//return true if bp<= asked-bp
        const index = _.keys.indexOf(bp);
        const subKeys = _.keys.slice(0, index + 1);

        return subKeys.some(i => i === _.currentBp);
    },
    addFkt: (type, bps, cb) => {
        _.arrayIfy(bps).forEach((key) => {
            if (!type[key]) type[key] = []

            type[key].push(cb)
        });
    },
    setActBp: (item) => {
        //set true or false eg; bp.sm=false
        //fire entry and or leave funktions
        _.is[item.key] = item.mQ.matches;

        if (item.mQ.matches) { // If media query matches
            _.currentBp = item.key;
            _.entryFkts[item.key] && _.entryFkts[item.key].forEach(i => i());
        } else {
            _.leaveFkts[item.key] && _.leaveFkts[item.key].forEach(i => i());
        }
    }
};

(function init() {
    _.keys = Object.keys(breakpoints);
    _.keys.map((key, index) => {
        const bpMinValue = index ? breakpoints[_.keys[index - 1]].breakpoint.value : '0px';
        const mq = `(min-width: ${bpMinValue}) and (max-width: ${breakpoints[key].breakpoint.value})`;

        return {
            mQ: window.matchMedia(mq),
            key
        }
    }).forEach((item) => {
        _.setActBp(item);
        item.mQ.addListener(() => _.setActBp(item));
    })
})();

export default {
    breakpoints,
    /*  onLeave: (bps, cb) => _.addFkt(_.leaveFkts, bps, cb),
      onEntry: (bps, cb) => _.addFkt(_.entryFkts, bps, cb),
      getCurrentViewport: () => _.currentBp,*/
    is: _.is,//object to keep bp status eg:is.sm
    isIn: _.isIn,//object to keep bp status eg:is.sm
};
