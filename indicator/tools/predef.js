/* DEV STUB (Node only -- never pasted into Tradovate). */
'use strict';
module.exports = {
  paramSpecs: {
    period: n => ({ type: 'period', def: n }),
    number: (d, step, min) => ({ type: 'number', def: d, step, min }),
    bool: d => ({ type: 'bool', def: d }),
    color: c => ({ type: 'color', def: c }),
    percent: (d, step, min, max) => ({ type: 'percent', def: d, step, min, max }),
    enum: (opts, d) => ({ type: 'enum', opts, def: d }),
  },
  plotters: {
    custom: fn => ({ type: 'custom', fn }),
    histogram: { type: 'histogram' },
    singleline: name => ({ type: 'singleline', name }),
    dots: name => ({ type: 'dots', name }),
  },
  styles: { plot: o => o },
  tags: { Volumes: 'Volumes' },
};
