/**
 * Dialogue beats. `character` selects the portrait; `chapter` is the small
 * caps line above the speaker.
 */
export const STORY = Object.freeze({
  prologue: [
    { chapter: "PROLOGUE · AFTER THE RAIN", speaker: "Mote", character: "mote", text: "Gloob? Good. You still wobble." },
    { chapter: "PROLOGUE · AFTER THE RAIN", speaker: "Mote", character: "mote", text: "The old compression engine woke under Lumenfen. It calls itself the Press now. It says one shape is the safest number of shapes." },
    { chapter: "PROLOGUE · AFTER THE RAIN", speaker: "Gloob", character: "gloob", text: "Blorp?" },
    { chapter: "PROLOGUE · AFTER THE RAIN", speaker: "Mote", character: "mote", text: "Exactly. Gather the Echo Seeds. They remember how the marsh moved before the machine made everything hold still." }
  ],
  rootVault: [
    { chapter: "ACT II · THE ROOT VAULT", speaker: "Mote", character: "mote", text: "That beacon opened the lower roots. I can hear three Plinks tapping inside their amber locks." },
    { chapter: "ACT II · THE ROOT VAULT", speaker: "Gloob", character: "gloob", text: "Blorp blorp." },
    { chapter: "ACT II · THE ROOT VAULT", speaker: "Mote", character: "mote", text: "Right. No key. Come down hard on each lock and remind it that pressure can open things too." }
  ],
  boss: [
    { chapter: "ACT III · THE PRESSURE CHAMBER", speaker: "The Press", character: "press", text: "VARIABLE FORM DETECTED. INSTABILITY IS A KIND OF PAIN. PLEASE HOLD STILL." },
    { chapter: "ACT III · THE PRESSURE CHAMBER", speaker: "Mote", character: "mote", text: "When it slams, jump the shockwave. Its coral eye opens afterward. That is the only part of it still willing to change." },
    { chapter: "ACT III · THE PRESSURE CHAMBER", speaker: "Gloob", character: "gloob", text: "Blorp." }
  ],
  epilogue: [
    { chapter: "EPILOGUE · MANY SHAPES", speaker: "The Press", character: "press", text: "PRESERVATION ERROR. CHANGE… MAY ALSO BE CONTINUITY." },
    { chapter: "EPILOGUE · MANY SHAPES", speaker: "Mote", character: "mote", text: "Listen. The Plinks found the beat again. The roots are answering." },
    { chapter: "EPILOGUE · MANY SHAPES", speaker: "Gloob", character: "gloob", text: "Blooorp." },
    { chapter: "EPILOGUE · MANY SHAPES", speaker: "Mote", character: "mote", text: "Yes. Very heroic. Also extremely damp." }
  ]
});

/** Fired once, mid-fight, when the Press loses half of its seals. */
export const BOSS_PHASE_LINE = Object.freeze({
  speaker: "The Press",
  text: "SEALS FAILING. INCREASING CERTAINTY."
});
