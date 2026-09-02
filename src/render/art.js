/** The three generated plates. Provenance lives in docs/ASSET_PROVENANCE.md. */
export const ART_SOURCES = Object.freeze({
  marsh: "assets/art/lumenfen-marsh.png",
  gloob: "assets/art/gloob.png",
  press: "assets/art/the-press.png"
});

function loadImage(src) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  const ready = image.decode
    ? image.decode().catch(() => undefined)
    : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
  return { image, ready };
}

/**
 * Returns `{ marsh, gloob, press }` handles plus a promise that settles once
 * every plate has decoded. Decode failures resolve rather than reject — the
 * renderer has a drawn fallback for each one.
 */
export function loadArt(sources = ART_SOURCES) {
  const art = {};
  for (const [key, src] of Object.entries(sources)) art[key] = loadImage(src);
  return { art, ready: Promise.all(Object.values(art).map((entry) => entry.ready)) };
}

export function isDrawable(entry) {
  return Boolean(entry?.image?.complete && entry.image.naturalWidth);
}
