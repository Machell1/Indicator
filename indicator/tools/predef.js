/* DEV STUB (Node only -- never pasted into Tradovate). */
'use strict';
module.exports = {
  paramSpecs: {
    period: n => ({ type: 'period', def: n }),
    number: (d, step, min) => ({ type: 'number', def: d, step, min }),
    bool: d => ({ type: 'bool', def: d }),
  },
};
