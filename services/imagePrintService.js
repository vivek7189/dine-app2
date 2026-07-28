// Bridge between the (non-component) printerService and the mounted <ImagePrintHost>.
//
// Image (HTML) receipt printing is an OPT-IN mode: when printSettings.imagePrintEnabled is on,
// the thermal print path renders the SAME web/Electron bill/KOT HTML to an image and prints it,
// so the receipt looks identical to the desktop. This module only holds the enabled flag and a
// reference to the host's capture function. If the flag is off, no host is mounted, or capture
// fails, the caller falls back to the existing ESC/POS text print — so nothing can break.

let _capture = null;         // (html, opts) => Promise<fileUri>

// The <ImagePrintHost> registers its capture function on mount.
export const registerImagePrintHost = (fn) => { _capture = typeof fn === 'function' ? fn : null; };
export const unregisterImagePrintHost = () => { _capture = null; };
export const hasImagePrintHost = () => !!_capture;

// Render HTML → PNG file URI via the mounted host. Rejects if no host is mounted or capture fails
// (the caller then falls back to the text print).
export const htmlToImageFile = (html, opts = {}) => {
  if (!_capture) return Promise.reject(new Error('image-print host not mounted'));
  if (!html) return Promise.reject(new Error('no html'));
  return _capture(html, opts);
};
