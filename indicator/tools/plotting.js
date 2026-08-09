/* DEV STUB (Node only -- never pasted into Tradovate). Mirrors the shape of
 * the platform's ./tools/plotting helpers just enough for the Node sims to
 * exercise custom canvas plotters. */
'use strict';
module.exports = {
  x: {
    get: item => (item && item.__x !== undefined) ? item.__x : 0,
    between: (a, b, f) => a + (b - a) * f,
  },
  offset: (x, y) => ({ x, y }),
  createPath: () => {
    const ops = [];
    return {
      moveTo: (x, y) => ops.push(['moveTo', x, y]),
      lineTo: (x, y) => ops.push(['lineTo', x, y]),
      end: () => ops,
    };
  },
};
