/**
 * Story playback over a native `<dialog>`.
 *
 * Listeners are attached per scene and removed when it ends, so replaying a
 * scene can never stack duplicate advance handlers — the bug you only notice
 * three acts later when one click skips four lines.
 */
export class StoryPlayer {
  constructor(elements, { onOpen, onClose } = {}) {
    this.elements = elements;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.active = null;
    elements.storyDialog.addEventListener("cancel", (event) => event.preventDefault());
  }

  get isOpen() {
    return this.elements.storyDialog.open;
  }

  play(lines, onComplete) {
    if (this.active) this.#teardown();
    const { elements } = this;
    let index = 0;

    const render = () => {
      const line = lines[index];
      elements.storyChapter.textContent = line.chapter;
      elements.storySpeaker.textContent = line.speaker;
      elements.storyText.textContent = line.text;
      elements.storyPortrait.dataset.character = line.character;
      elements.motePortrait.hidden = line.character !== "mote";
      elements.storyPortraitImage.hidden = line.character === "mote";
      if (line.character !== "mote") {
        const isPress = line.character === "press";
        elements.storyPortraitImage.src = isPress ? "assets/art/the-press.png" : "assets/art/gloob.png";
        elements.storyPortraitImage.alt = isPress
          ? "The Press, an ancient brass compression automaton"
          : "Gloob, the translucent chartreuse Squishymon";
      }
      elements.storyNextButton.textContent = index === lines.length - 1 ? "Into the marsh" : "Keep listening";
      elements.storySkipButton.hidden = index === lines.length - 1;
      elements.storyProgress.replaceChildren(...lines.map((_, dot) => {
        const pip = document.createElement("i");
        if (dot === index) pip.className = "is-current";
        return pip;
      }));
      elements.storyProgress.setAttribute("aria-valuemax", String(lines.length));
      elements.storyProgress.setAttribute("aria-valuenow", String(index + 1));
    };

    const finish = () => {
      this.#teardown();
      if (elements.storyDialog.open) elements.storyDialog.close();
      this.onClose?.();
      onComplete?.();
    };

    const advance = () => {
      index += 1;
      if (index < lines.length) render();
      else finish();
    };

    this.active = { advance, skip: finish };
    elements.storyNextButton.addEventListener("click", advance);
    elements.storySkipButton.addEventListener("click", finish);

    render();
    if (!elements.storyDialog.open) elements.storyDialog.showModal();
    this.onOpen?.();
    elements.storyNextButton.focus();
  }

  #teardown() {
    if (!this.active) return;
    this.elements.storyNextButton.removeEventListener("click", this.active.advance);
    this.elements.storySkipButton.removeEventListener("click", this.active.skip);
    this.active = null;
  }
}

/**
 * Non-story dialogs (how to play, field notes, settings). Opening one asks the
 * shell to hold the simulation; closing hands control back.
 */
export class PanelController {
  constructor({ onOpen, onClose } = {}) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.openDialog = null;
  }

  register(dialog) {
    dialog.addEventListener("close", () => {
      if (this.openDialog === dialog) this.openDialog = null;
      this.onClose?.(dialog);
    });
    return dialog;
  }

  open(dialog) {
    if (dialog.open) return;
    this.openDialog = dialog;
    this.onOpen?.(dialog);
    dialog.showModal();
    dialog.querySelector("button:not([disabled])")?.focus();
  }

  closeAll() {
    if (this.openDialog?.open) this.openDialog.close();
  }

  get anyOpen() {
    return Boolean(this.openDialog?.open);
  }
}
