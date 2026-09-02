import { MAX_FRAME_DELTA, STEP } from "./core/constants.js";
import { formatTime } from "./core/math.js";
import { STORY } from "./data/story.js";
import { ACT_COUNT, LEVEL_DEFS } from "./data/levels.js";
import { findCreature } from "./data/creatures.js";
import { Simulation } from "./game/simulation.js";
import { InputState, KEY_MAP } from "./game/input.js";
import {
  defaultSave,
  loadSave,
  persistSave,
  recordActTime,
  recordRunTime,
  unlockAct
} from "./game/save.js";
import { Soundscape } from "./audio/soundscape.js";
import { loadArt } from "./render/art.js";
import { readPalette } from "./render/palette.js";
import { Viewport } from "./render/viewport.js";
import { Effects } from "./render/effects.js";
import { Scene } from "./render/scene.js";
import { queryElements } from "./ui/dom.js";
import { Announcer } from "./ui/announcer.js";
import { Hud } from "./ui/hud.js";
import { PanelController, StoryPlayer } from "./ui/dialogs.js";
import { renderChapterSelect, renderFieldNotes, renderSettings, renderTitleStats } from "./ui/panels.js";

const elements = queryElements();
const palette = readPalette();
const viewport = new Viewport(elements.canvas).observe();
const { art, ready: artReady } = loadArt();
const audio = new Soundscape();
const input = new InputState();
const announcer = new Announcer(elements.announcer, elements.toast);
const hud = new Hud(elements);

const storage = safeStorage();
const save = loadSave(storage);
let storageWorks = persistSave(storage, save);

const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const effects = new Effects(palette, { reducedMotion: prefersReducedMotion() });
const scene = new Scene({ palette, art, effects });

let sim = new Simulation({ assist: save.settings.assist });
const state = {
  mode: "title",
  startedAct: 0,
  transitioning: false,
  starting: false,
  gamepadSeen: false,
  accumulator: 0,
  lastFrame: performance.now()
};

const panels = new PanelController({
  onOpen: () => {
    input.releaseAll();
    sim.cancelCharge();
    if (state.mode === "playing") setMode("panel");
  },
  onClose: () => {
    if (state.mode === "panel") enterPlaying();
  }
});
for (const dialog of [elements.howDialog, elements.fieldDialog, elements.settingsDialog]) {
  panels.register(dialog);
}
elements.settingsDialog.addEventListener("close", () => disarmErase());

const story = new StoryPlayer(elements, {
  onOpen: () => {
    input.releaseAll();
    sim.cancelCharge();
  }
});

// --------------------------------------------------------------- utilities

function safeStorage() {
  try {
    const probe = "__squishymon__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion() {
  if (save.settings.motion === "reduced") return true;
  if (save.settings.motion === "full") return false;
  return motionQuery.matches;
}

function commitSave() {
  storageWorks = persistSave(storage, save);
  renderSettings(elements, save, { storageWorks });
}

function setMode(mode) {
  state.mode = mode;
  elements.app.dataset.mode = mode;
  input.enabled = mode === "playing";
  if (mode !== "playing") input.releaseAll();
}

function focusCanvas() {
  elements.canvas.tabIndex = 0;
  elements.canvas.focus({ preventScroll: true });
}

function blurCanvas() {
  elements.canvas.tabIndex = -1;
}

function unlockCreature(id) {
  if (save.unlocked.includes(id)) return;
  save.unlocked.push(id);
  commitSave();
  renderFieldNotes(elements.fieldGrid, save);
  const creature = findCreature(id);
  if (creature) announcer.both(`New field note: ${creature.name}.`);
}

// ------------------------------------------------------------------ events

/** Turns simulation events into sound, particles, narration, and flow. */
function handleSimEvents() {
  for (const event of sim.events.drain()) {
    switch (event.type) {
      case "sound":
        audio.play(event.name, event.amount);
        break;
      case "burst":
        effects.burst(event);
        break;
      case "shake":
        effects.addShake(event.amount);
        break;
      case "flash":
        effects.addFlash(event.amount, event.tone);
        break;
      case "announce":
        announcer.say(event.text);
        break;
      case "unlock":
        unlockCreature(event.id);
        break;
      case "objectiveReminder":
        announcer.both(sim.objectiveCopy());
        break;
      case "seed":
        if (event.chain >= 3) announcer.toast(`Echo chain ×${event.chain}`, 1400);
        break;
      case "bossPhase":
        audio.play("bossPhase");
        effects.addFlash(0.8, "coral");
        announcer.both("The Press is done being patient.");
        break;
      case "levelReady":
        onLevelReady();
        break;
      case "levelComplete":
        onLevelComplete(event);
        break;
      case "gameOver":
        showEndScreen(false);
        break;
      case "victory":
        onVictory();
        break;
      default:
        break;
    }
  }
}

/**
 * A level can become ready while a story scene is still on screen, so the act
 * card is held back until the player actually has control.
 */
let pendingActCard = null;

function onLevelReady() {
  const level = sim.level;
  hud.showBossMeter(Boolean(level.boss));
  audio.setTension(level.boss ? 1 : 0);
  announcer.say(`${level.name}. ${level.objective}`);
  hud.sync(sim);
  pendingActCard = level;
}

function enterPlaying() {
  setMode("playing");
  focusCanvas();
  if (pendingActCard) {
    hud.showActBanner(pendingActCard);
    pendingActCard = null;
  }
}

function onLevelComplete(event) {
  if (state.transitioning) return;
  state.transitioning = true;
  input.releaseAll();
  sim.cancelCharge();

  if (recordActTime(save, event.index, event.actElapsed)) {
    announcer.toast(`${sim.level.name} best: ${formatTime(event.actElapsed)}`);
  }
  unlockAct(save, event.index + 1);
  commitSave();

  const nextIndex = event.index + 1;
  const lines = nextIndex === 1 ? STORY.rootVault : STORY.boss;
  setMode("story");
  story.play(lines, () => {
    sim.loadLevel(nextIndex);
    state.transitioning = false;
    enterPlaying();
  });
}

function onVictory() {
  if (state.transitioning) return;
  state.transitioning = true;
  audio.play("victory");
  setMode("story");
  story.play(STORY.epilogue, () => {
    state.transitioning = false;
    showEndScreen(true);
  });
}

// ------------------------------------------------------------------- flow

async function beginRun(actIndex = 0) {
  if (state.starting) return;
  state.starting = true;
  const buttons = [elements.startButton, elements.replayButton];
  for (const button of buttons) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }
  elements.startButton.dataset.state = "loading";

  try {
    await artReady;
    if (save.settings.sound) await audio.setEnabled(true);
    syncSoundButton();
    elements.startButton.dataset.state = "success";
  } catch (error) {
    console.error("Squishymon could not begin the run.", error);
    announcer.both("The marsh did not wake. Try beginning the bloom again.");
    releaseStartButtons(buttons);
    return;
  }
  window.setTimeout(() => releaseStartButtons(buttons), 420);

  save.runs += 1;
  commitSave();

  sim = new Simulation({ assist: save.settings.assist });
  sim.reset({ levelIndex: actIndex });
  state.startedAct = actIndex;
  state.transitioning = false;
  effects.particles.length = 0;

  elements.titleScreen.hidden = true;
  elements.titleFooter.hidden = true;
  elements.endScreen.hidden = true;
  elements.hud.hidden = false;
  elements.pauseButton.disabled = false;

  handleSimEvents();

  const intro = actIndex === 0 ? STORY.prologue : null;
  if (intro) {
    setMode("story");
    story.play(intro, enterPlaying);
  } else {
    enterPlaying();
  }
}

function releaseStartButtons(buttons) {
  for (const button of buttons) {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
  }
  delete elements.startButton.dataset.state;
  state.starting = false;
}

function showTitle() {
  panels.closeAll();
  if (elements.storyDialog.open) elements.storyDialog.close();
  if (elements.pauseDialog.open) elements.pauseDialog.close();
  hud.hideActBanner();
  elements.titleScreen.hidden = false;
  elements.titleFooter.hidden = false;
  elements.hud.hidden = true;
  elements.endScreen.hidden = true;
  elements.pauseButton.disabled = true;
  blurCanvas();
  setMode("title");
  audio.setTension(0);
  renderTitleStats(elements, save);
  renderChapterSelect(elements.chapterButtons, save, (index) => beginRun(index));
}

function showEndScreen(victory) {
  hud.hideActBanner();
  elements.hud.hidden = true;
  elements.endScreen.hidden = false;
  elements.pauseButton.disabled = true;
  blurCanvas();
  setMode(victory ? "victory" : "gameover");

  elements.finalSeeds.textContent = String(sim.totals.seeds);
  elements.finalRescues.textContent = String(sim.totals.rescues);
  elements.finalChain.textContent = sim.bestChain ? `×${sim.bestChain}` : "0";
  elements.finalTime.textContent = formatTime(sim.elapsed);

  save.totals.seeds += sim.totals.seeds;
  save.totals.rescues += sim.totals.rescues;
  save.totals.squishes += sim.totals.squishes;
  save.bestChain = Math.max(save.bestChain, sim.bestChain);

  let record = false;
  if (victory) {
    elements.endKicker.textContent = "LUMENFEN BREATHES AGAIN";
    elements.endTitle.textContent = "Softness won.";
    elements.endText.textContent = "The marsh remembers every shape it was allowed to become.";
    save.wins += 1;
    unlockAct(save, ACT_COUNT - 1);
    // A partial run started from act two is not a comparable full-game time.
    record = state.startedAct === 0 && recordRunTime(save, sim.elapsed);
    if (!save.unlocked.includes("mossmellow")) unlockCreature("mossmellow");
  } else {
    elements.endKicker.textContent = "THE MARSH IS STILL LISTENING";
    elements.endTitle.textContent = "Gloob needs another bounce.";
    elements.endText.textContent = "Pressure won this round. It did not get the last word.";
  }
  elements.recordNote.hidden = !record;
  commitSave();
  renderTitleStats(elements, save);
  renderChapterSelect(elements.chapterButtons, save, (index) => beginRun(index));

  announcer.say(victory ? "Lumenfen breathes again. You won." : "Run ended. Play again when ready.");
  requestAnimationFrame(() => elements.replayButton.focus({ preventScroll: true }));
}

function togglePause(force) {
  if (!["playing", "paused"].includes(state.mode)) return;
  const shouldPause = force ?? state.mode === "playing";
  if (shouldPause) {
    setMode("paused");
    sim.cancelCharge();
    if (!elements.pauseDialog.open) elements.pauseDialog.showModal();
    elements.resumeButton.focus();
  } else {
    if (elements.pauseDialog.open) elements.pauseDialog.close();
    setMode("playing");
    focusCanvas();
  }
}

function restartAct() {
  if (elements.pauseDialog.open) elements.pauseDialog.close();
  state.transitioning = false;
  sim.loadLevel(sim.levelIndex);
  handleSimEvents();
  enterPlaying();
}

// --------------------------------------------------------------- settings

async function applySound(enabled) {
  const ok = await audio.setEnabled(enabled);
  save.settings.sound = ok ? enabled : false;
  commitSave();
  syncSoundButton();
}

function syncSoundButton() {
  const on = audio.enabled;
  elements.soundButton.setAttribute("aria-pressed", String(on));
  elements.soundButton.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
  elements.soundUse.setAttribute("href", on ? "#icon-sound" : "#icon-mute");
  elements.soundLabel.textContent = on ? "SOUND ON" : "SOUND OFF";
  renderSettings(elements, save, { storageWorks });
}

function setAssist(enabled) {
  save.settings.assist = enabled;
  commitSave();
  sim.assist = enabled;
  // Mid-run heart count follows the mode so the change is felt immediately.
  const target = enabled ? 5 : 3;
  sim.player.maxHearts = target;
  sim.player.hearts = Math.min(sim.player.hearts + (enabled ? target - 3 : 0), target);
  hud.sync(sim);
  announcer.toast(enabled ? "Assist mode on." : "Assist mode off.");
}

function setMotion(preference) {
  save.settings.motion = preference;
  commitSave();
  effects.reducedMotion = prefersReducedMotion();
  document.documentElement.dataset.motion = preference;
}

/**
 * Erasing is destructive and sits one tap away from the sound toggle, so the
 * first press only arms it. The armed state lapses on its own.
 */
let eraseArmTimer = null;

function armErase() {
  if (elements.resetSaveButton.dataset.armed === "true") {
    eraseSave();
    return;
  }
  elements.resetSaveButton.dataset.armed = "true";
  elements.resetSaveButton.textContent = "Tap again to erase";
  window.clearTimeout(eraseArmTimer);
  eraseArmTimer = window.setTimeout(disarmErase, 5000);
}

function disarmErase() {
  window.clearTimeout(eraseArmTimer);
  delete elements.resetSaveButton.dataset.armed;
  elements.resetSaveButton.textContent = "Erase";
}

function eraseSave() {
  disarmErase();
  const fresh = defaultSave();
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  commitSave();
  effects.reducedMotion = prefersReducedMotion();
  document.documentElement.dataset.motion = save.settings.motion;
  renderFieldNotes(elements.fieldGrid, save);
  renderTitleStats(elements, save);
  renderChapterSelect(elements.chapterButtons, save, (index) => beginRun(index));
  syncSoundButton();
  announcer.both("Saved progress erased.");
}

// ----------------------------------------------------------------- binding

function bindHoldButton(button, control) {
  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    input.set("touch", control, true);
    button.classList.add("is-held");
  };
  const release = (event) => {
    event?.preventDefault();
    input.set("touch", control, false);
    button.classList.remove("is-held");
  };
  button.addEventListener("pointerdown", press);
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, release);
  }
  // Keyboard activation of a touch control: a short synthetic hold.
  button.addEventListener("click", (event) => {
    if (event.detail !== 0 || state.mode !== "playing") return;
    input.set("touch", control, true);
    button.classList.add("is-held");
    window.setTimeout(() => release(), control === "squish" ? 380 : 180);
  });
}

elements.startButton.addEventListener("click", () => beginRun(0));
elements.replayButton.addEventListener("click", () => beginRun(0));
elements.howButton.addEventListener("click", () => panels.open(elements.howDialog));
elements.bestiaryButton.addEventListener("click", () => panels.open(elements.fieldDialog));
elements.notesFromEndButton.addEventListener("click", () => panels.open(elements.fieldDialog));
elements.settingsButton.addEventListener("click", () => panels.open(elements.settingsDialog));
elements.soundButton.addEventListener("click", () => applySound(!audio.enabled));
elements.soundToggle.addEventListener("click", () => applySound(!audio.enabled));
elements.assistToggle.addEventListener("click", () => setAssist(!save.settings.assist));
elements.motionSystem.addEventListener("click", () => setMotion("system"));
elements.motionFull.addEventListener("click", () => setMotion("full"));
elements.motionReduced.addEventListener("click", () => setMotion("reduced"));
elements.resetSaveButton.addEventListener("click", armErase);
elements.pauseButton.addEventListener("click", () => togglePause());
elements.resumeButton.addEventListener("click", () => togglePause(false));
elements.restartButton.addEventListener("click", restartAct);
elements.quitButton.addEventListener("click", () => {
  if (elements.pauseDialog.open) elements.pauseDialog.close();
  showTitle();
});
elements.homeButton.addEventListener("click", () => {
  if (state.mode === "playing") togglePause(true);
  else if (["victory", "gameover", "paused"].includes(state.mode)) showTitle();
});
elements.pauseDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  togglePause(false);
});

bindHoldButton(elements.leftButton, "left");
bindHoldButton(elements.rightButton, "right");
bindHoldButton(elements.squishButton, "squish");

window.addEventListener("keydown", (event) => {
  const onControl = event.target instanceof Element
    && event.target.closest("button, a, input, select, textarea, [role='button']");
  const gameplay = state.mode === "playing" && !onControl;
  const control = KEY_MAP[event.code];

  if (gameplay && control) {
    event.preventDefault();
    if (!(event.repeat && control === "squish")) input.set("keyboard", control, true);
  }
  if (event.code === "KeyM") applySound(!audio.enabled);
  if ((event.code === "Escape" || event.code === "KeyP") && !elements.storyDialog.open && !panels.anyOpen) {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener("keyup", (event) => {
  const control = KEY_MAP[event.code];
  if (control) input.set("keyboard", control, false);
});

window.addEventListener("blur", () => {
  input.releaseAll();
  if (state.mode === "playing") togglePause(true);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    input.releaseAll();
    if (state.mode === "playing") togglePause(true);
  }
});

motionQuery.addEventListener("change", () => {
  effects.reducedMotion = prefersReducedMotion();
});

// -------------------------------------------------------------- main loop

function frame(now) {
  const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;

  if (input.pollGamepad() && !state.gamepadSeen) {
    state.gamepadSeen = true;
    announcer.toast("Gamepad connected. Stick or D-pad to move, any face button to squish.");
  }

  if (state.mode === "playing") {
    state.accumulator = Math.min(state.accumulator + delta, MAX_FRAME_DELTA);
    const snapshot = input.snapshot();
    // Fixed steps keep physics identical on a 60Hz laptop and a 144Hz monitor.
    while (state.accumulator >= STEP) {
      sim.step(STEP, snapshot);
      state.accumulator -= STEP;
      if (sim.status !== "running") break;
    }
    handleSimEvents();
    hud.sync(sim);
  } else {
    state.accumulator = 0;
    handleSimEvents();
  }

  effects.update(delta);
  scene.draw(viewport.begin(), sim, now);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ start

document.documentElement.dataset.motion = save.settings.motion;
renderFieldNotes(elements.fieldGrid, save);
renderTitleStats(elements, save);
renderChapterSelect(elements.chapterButtons, save, (index) => beginRun(index));
renderSettings(elements, save, { storageWorks });
syncSoundButton();
hud.sync(sim);
sim.events.drain();
showTitle();
requestAnimationFrame(frame);

/**
 * A read-only window onto the running game. Used by the browser test pass and
 * handy in the console; nothing in the game reads it back.
 */
window.__SQUISHYMON__ = Object.freeze({
  get mode() { return state.mode; },
  get level() { return sim.levelIndex; },
  get acts() { return ACT_COUNT; },
  get actName() { return LEVEL_DEFS[sim.levelIndex].name; },
  get seeds() { return sim.totals.seeds; },
  get rescues() { return sim.totals.rescues; },
  get hearts() { return sim.player.hearts; },
  get chain() { return sim.chain; },
  get bossHealth() { return sim.level.bossEntity?.hp ?? null; },
  get bossPhase() { return sim.level.bossEntity?.phase ?? null; },
  get playerX() { return Math.round(sim.player.x * 100) / 100; },
  get playerY() { return Math.round(sim.player.y * 100) / 100; },
  get charge() { return Math.round(sim.player.charge * 100) / 100; },
  get objective() { return sim.objectiveCopy(); },
  get assist() { return sim.assist; },
  start: beginRun,
  pause: () => togglePause(true),
  resume: () => togglePause(false),
  title: showTitle,
  /** Load an act directly. Used by the browser pass and handy for debugging. */
  jumpTo(index) {
    if (state.mode === "title") return false;
    state.transitioning = false;
    sim.loadLevel(index);
    handleSimEvents();
    enterPlaying();
    return true;
  }
});
