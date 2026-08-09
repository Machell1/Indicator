/* DEV STUB (Node only -- never pasted into Tradovate). Mirrors the shape of
 * the platform's ./tools/graphics helpers just enough for the Node sims to
 * construct and inspect graphics items. */
'use strict';
module.exports = {
  du: v => ({ unit: 'du', v }),
  px: v => ({ unit: 'px', v }),
  op: (a, o, b) => ({ unit: 'op', op: o, a, b }),
};
