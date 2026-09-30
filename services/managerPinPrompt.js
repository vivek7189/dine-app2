// Roles "Needs manager PIN": services/api.js asks here when the server answers MANAGER_PIN_REQUIRED /
// MANAGER_PIN_INVALID; components/ManagerPinPromptHost.js (mounted once in app/_layout.js) shows the box.
let handler = null;

export function setManagerPinHandler(fn) {
  handler = typeof fn === 'function' ? fn : null;
}

// → Promise<string | null> (null = cancelled or no box mounted)
export function askManagerPin(opts = {}) {
  if (!handler) return Promise.resolve(null);
  return handler(opts);
}
