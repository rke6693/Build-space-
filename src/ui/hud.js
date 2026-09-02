import { TUNING } from "../core/constants.js";
import { clamp, formatTime } from "../core/math.js";

/**
 * Mirrors simulation state into the DOM overlay.
 *
 * Every setter compares before it writes: the HUD is touched once per frame,
 * and blind writes to `textContent` would keep the accessibility tree busy
 * announcing values that never changed.
 */
export class Hud {
  constructor(elements) {
    this.elements = elements;
    this.cache = new Map();
    this.bannerTimer = null;
  }

  #text(node, value) {
    if (this.cache.get(node) === value) return false;
    this.cache.set(node, value);
    node.textContent = value;
    return true;
  }

  hearts(count) {
    return Array.from({ length: Math.max(count, 0) }, () => "●").join(" ");
  }

  sync(sim) {
    const { elements } = this;
    const level = sim.level;
    const player = sim.player;

    this.#text(elements.chapterStatus, level.name);
    this.#text(elements.seedStatus, level.boss ? "—" : `${level.collected} / ${level.seedGoal}`);
    this.#text(elements.timeStatus, formatTime(sim.elapsed));

    const filled = Array.from({ length: player.maxHearts }, (_, index) => (index < player.hearts ? "●" : "○")).join(" ");
    const label = `${player.hearts} ${player.hearts === 1 ? "heart" : "hearts"} remaining`;
    if (this.#text(elements.heartStatus, filled)) {
      elements.heartStatus.setAttribute("aria-label", label);
    }
    if (this.#text(elements.objectiveHearts, filled)) {
      elements.objectiveHearts.setAttribute("aria-label", label);
    }
    this.#text(elements.objectiveText, sim.objectiveCopy());

    this.charge(sim);
    this.chain(sim);
    if (level.boss) this.boss(sim);
  }

  charge(sim) {
    const { elements } = this;
    const charge = sim.player.charge;
    const percent = Math.round(charge * 100);
    if (elements.chargeTrack.getAttribute("aria-valuenow") !== String(percent)) {
      elements.chargeTrack.setAttribute("aria-valuenow", String(percent));
    }
    elements.chargeFill.style.transform = `scaleX(${charge})`;
    this.#text(
      elements.chargeLabel,
      charge > 0.85 ? "Full spring" : charge > 0.4 ? "Holding" : charge > 0 ? "Compressing" : "Ready"
    );
    this.#text(
      elements.squishButton,
      charge > 0.75 ? "RELEASE TO SPRING" : charge > 0 ? "KEEP HOLDING" : "HOLD TO SQUISH"
    );
  }

  chain(sim) {
    const { elements } = this;
    const active = sim.chain >= 2 && sim.chainTimer > 0;
    if (elements.chainPip.hidden === !active) elements.chainPip.hidden = !active;
    if (!active) return;
    this.#text(elements.chainCount, `×${sim.chain}`);
    elements.chainDecay.style.transform = `scaleX(${clamp(sim.chainTimer / TUNING.chainWindow, 0, 1)})`;
  }

  boss(sim) {
    const boss = sim.level.bossEntity;
    if (!boss) return;
    const { elements } = this;
    const hp = Math.max(0, boss.hp);
    this.#text(elements.bossHealthText, `${hp} / ${boss.maxHp}`);
    this.#text(elements.bossPhaseLabel, boss.phase === 2 ? "THE PRESS · CERTAIN" : "THE PRESS");
    if (elements.bossHealthTrack.getAttribute("aria-valuenow") !== String(hp)) {
      elements.bossHealthTrack.setAttribute("aria-valuenow", String(hp));
      elements.bossHealthTrack.setAttribute("aria-valuemax", String(boss.maxHp));
    }
    elements.bossHealthFill.style.transform = `scaleX(${hp / boss.maxHp})`;
    elements.bossMeter.dataset.phase = String(boss.phase);
  }

  showBossMeter(visible) {
    this.elements.bossMeter.hidden = !visible;
  }

  /** Act card that fades over the field for a few seconds on level start. */
  showActBanner(level) {
    const { elements } = this;
    elements.actBannerAct.textContent = level.act;
    elements.actBannerName.textContent = level.name;
    elements.actBannerLine.textContent = level.intro;
    elements.actBanner.hidden = false;
    elements.actBanner.dataset.state = "in";
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      elements.actBanner.dataset.state = "out";
      window.setTimeout(() => {
        elements.actBanner.hidden = true;
      }, 400);
    }, 2600);
  }

  hideActBanner() {
    window.clearTimeout(this.bannerTimer);
    this.elements.actBanner.hidden = true;
  }
}
