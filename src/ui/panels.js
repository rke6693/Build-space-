import { CREATURES } from "../data/creatures.js";
import { LEVEL_DEFS } from "../data/levels.js";
import { formatTime } from "../core/math.js";

/** Field-note cards. Locked entries stay in place so the gaps are visible. */
export function renderFieldNotes(grid, save) {
  grid.replaceChildren(...CREATURES.map((creature) => {
    const unlocked = save.unlocked.includes(creature.id);
    const article = document.createElement("article");
    article.className = `field-card${unlocked ? "" : " is-locked"}`;
    article.dataset.tone = unlocked ? creature.tone : "locked";

    const mark = document.createElement("span");
    mark.className = "field-card__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = unlocked ? creature.mark : "?";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = unlocked ? creature.name : "Unrecorded shape";
    const note = document.createElement("p");
    note.textContent = unlocked ? creature.note : "Meet this creature in Lumenfen to reveal the note.";
    const kind = document.createElement("small");
    kind.textContent = unlocked ? creature.kind : "Field note locked";
    copy.append(title, note, kind);

    article.append(mark, copy);
    return article;
  }));
}

/**
 * Act picker. Acts past `save.furthestAct` are rendered but disabled, so the
 * shape of the campaign is legible before it is unlocked.
 */
export function renderChapterSelect(container, save, onPick) {
  container.replaceChildren(...LEVEL_DEFS.map((level, index) => {
    const unlocked = index <= save.furthestAct;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-chip";
    button.disabled = !unlocked;
    button.dataset.act = level.act;

    const name = document.createElement("strong");
    name.textContent = unlocked ? level.name : "LOCKED";
    const meta = document.createElement("span");
    const best = save.actBests[index];
    meta.textContent = unlocked ? (best ? `best ${formatTime(best)}` : level.subtitle) : "finish the act before";

    button.append(name, meta);
    button.setAttribute(
      "aria-label",
      unlocked ? `Start from ${level.act}, ${level.name}` : `${level.act} is locked`
    );
    if (unlocked) button.addEventListener("click", () => onPick(index));
    return button;
  }));
}

export function renderTitleStats(elements, save) {
  const hasHistory = save.wins > 0 || save.runs > 0;
  elements.titleStats.hidden = !hasHistory;
  elements.continueNote.hidden = save.wins === 0;
  elements.chapterSelect.hidden = save.furthestAct === 0;
  elements.statBestTime.textContent = save.bestTime ? formatTime(save.bestTime) : "—";
  elements.statWins.textContent = String(save.wins);
  elements.statChain.textContent = save.bestChain ? `×${save.bestChain}` : "0";
  elements.startLabel.textContent = save.wins > 0 ? "Bloom again" : "Begin the bloom";
}

/** Reflects the saved settings onto the settings dialog's controls. */
export function renderSettings(elements, save, { storageWorks = true } = {}) {
  const { sound, assist, motion } = save.settings;
  setToggle(elements.soundToggle, sound);
  setToggle(elements.assistToggle, assist);
  for (const [key, node] of [
    ["system", elements.motionSystem],
    ["full", elements.motionFull],
    ["reduced", elements.motionReduced]
  ]) {
    node.setAttribute("aria-pressed", String(motion === key));
  }
  elements.settingsNote.hidden = storageWorks;
}

function setToggle(button, on) {
  button.setAttribute("aria-checked", String(on));
  button.textContent = on ? "On" : "Off";
  button.dataset.on = String(on);
}
