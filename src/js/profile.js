// Build profile. build.py rewrites the PROFILE line for the store build (`python build.py --store`).
// "personal": the owner's own build — may carry a preset partner number, custom tier names and bundled pictures
//             via src/data/personal.js. "store": no personal data, neutral defaults, no bundled photos.
export const PROFILE = "personal";
export const IS_STORE = PROFILE === "store";
export const APP_VERSION = "1.1.0";
