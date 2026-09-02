/**
 * Every element the shell touches, resolved once. A missing id throws here
 * rather than surfacing later as a mysterious null dereference mid-frame.
 */
const IDS = [
  "app", "gameCanvas", "gameHeader", "stage",
  "titleScreen", "titleFooter", "hud", "endScreen",
  "startButton", "startLabel", "howButton", "homeButton",
  "bestiaryButton", "settingsButton", "soundButton", "soundUse", "soundLabel", "pauseButton",
  "chapterStatus", "seedStatus", "heartStatus", "timeStatus",
  "objectiveText", "objectiveHearts",
  "chainPip", "chainCount", "chainDecay",
  "chargeLabel", "chargeTrack", "chargeFill",
  "bossMeter", "bossPhaseLabel", "bossHealthText", "bossHealthTrack", "bossHealthFill",
  "actBanner", "actBannerAct", "actBannerName", "actBannerLine",
  "touchControls", "leftButton", "rightButton", "squishButton",
  "storyDialog", "storyPortrait", "storyPortraitImage", "motePortrait",
  "storyChapter", "storySpeaker", "storyText", "storyProgress",
  "storyNextButton", "storySkipButton",
  "howDialog", "fieldDialog", "fieldGrid",
  "settingsDialog", "soundToggle", "assistToggle",
  "motionSystem", "motionFull", "motionReduced", "resetSaveButton", "settingsNote",
  "pauseDialog", "resumeButton", "restartButton", "quitButton",
  "replayButton", "notesFromEndButton",
  "finalSeeds", "finalRescues", "finalChain", "finalTime", "recordNote",
  "endKicker", "endTitle", "endText",
  "chapterSelect", "chapterButtons", "titleStats", "statBestTime", "statWins", "statChain",
  "continueNote", "announcer", "toast"
];

/** camelCase alias for the canvas so calling code reads a little better. */
const ALIASES = { gameCanvas: "canvas" };

export function queryElements(root = document) {
  const elements = {};
  const missing = [];
  for (const id of IDS) {
    const node = root.getElementById(id);
    if (!node) {
      missing.push(id);
      continue;
    }
    elements[ALIASES[id] ?? id] = node;
  }
  if (missing.length) {
    throw new Error(`Squishymon is missing markup for: ${missing.join(", ")}`);
  }
  return elements;
}
