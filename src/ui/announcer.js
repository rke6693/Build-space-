/**
 * Screen-reader narration plus a matching visible toast.
 *
 * The live region is cleared first because repeating identical text is
 * otherwise swallowed by most screen readers.
 */
export class Announcer {
  constructor(liveRegion, toastElement) {
    this.liveRegion = liveRegion;
    this.toastElement = toastElement;
    this.toastTimer = null;
  }

  say(message) {
    if (!message) return;
    this.liveRegion.textContent = "";
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message;
    });
  }

  /** A short visible note for things worth seeing as well as hearing. */
  toast(message, duration = 2600) {
    if (!message) return;
    this.toastElement.textContent = message;
    this.toastElement.hidden = false;
    this.toastElement.dataset.state = "in";
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastElement.dataset.state = "out";
      this.toastElement.hidden = true;
    }, duration);
  }

  both(message, duration) {
    this.say(message);
    this.toast(message, duration);
  }
}
