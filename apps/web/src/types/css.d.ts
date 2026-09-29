// Next.js's own ambient types (node_modules/next/types/global.d.ts) only
// declare `*.module.css` (CSS Modules); a plain side-effect import like
// `import "./globals.css"` has no matching declaration. TypeScript 5.x
// tolerated that silently — 6.x's stricter side-effect-import check
// (TS2882) doesn't, so this fills the one gap Next.js leaves.
declare module "*.css";
