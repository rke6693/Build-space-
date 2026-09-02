import { WORLD } from "../core/constants.js";

/**
 * Keeps the canvas backing store matched to its CSS box and the device pixel
 * ratio, while drawing code keeps working in flat 1280×720 world units.
 *
 * Capped at 2× because the marsh is already a painted plate — beyond that the
 * extra pixels cost fill rate and buy nothing visible.
 */
const MAX_SCALE = 2;

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.scale = 1;
    this.observer = null;
  }

  /** Re-measures and resizes. Cheap enough to call on every resize event. */
  sync() {
    const ratio = Math.min(MAX_SCALE, Math.max(1, window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    // Before layout settles the rect can be zero; fall back to world units.
    const cssWidth = rect.width || WORLD.width;
    const target = Math.min(MAX_SCALE, Math.max(1, (cssWidth / WORLD.width) * ratio));
    const width = Math.round(WORLD.width * target);
    const height = Math.round(WORLD.height * target);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.scale = target;
    this.context.setTransform(target, 0, 0, target, 0, 0);
    this.context.imageSmoothingQuality = "high";
    return target;
  }

  /** Watches the element box so orientation changes and zoom are picked up. */
  observe() {
    this.sync();
    window.addEventListener("resize", () => this.sync());
    window.addEventListener("orientationchange", () => this.sync());
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(() => this.sync());
      this.observer.observe(this.canvas);
    }
    return this;
  }

  /** Resets the transform for a frame; call once before drawing. */
  begin() {
    this.context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    return this.context;
  }
}
