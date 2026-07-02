// Thin re-export of the org ESLint base. The canonical preset lives at
// ../library/config/eslint.base.mjs and is consumed by relative path inside
// this repo; external consumers vendor a byte-identical copy instead.
import base from '../library/config/eslint.base.mjs';

export default base;
