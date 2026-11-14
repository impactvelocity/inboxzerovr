/**
 * The level-select cards show small copies of their pictures (public/thumbs/<path>, 432 px tall, made by
 * tools/thumbs.mjs), not the 1672 px originals: a third of the bytes and a tenth of the decoded pixels in
 * the headset's browser. A picture with no thumb yet (one just added) falls back to itself.
 */
const base = import.meta.env.BASE_URL;
const probes = new Map<string, Promise<string>>();

/** The thumb's path (relative to the base) if it exists, else the picture's own. */
export function thumb(url: string): Promise<string> {
  let got = probes.get(url);
  if (!got) {
    got = new Promise(done => {
      const image = new Image();
      image.onload = () => done(`thumbs/${url}`);
      image.onerror = () => done(url);
      image.src = `${base}thumbs/${url}`;
    });
    probes.set(url, got);
  }
  return got;
}

/** Shows `url`'s thumb as the element's background (the picture itself if there is no thumb). */
export function thumbBackground(element: HTMLElement, url: string) {
  void thumb(url).then(src => { element.style.backgroundImage = `url('${base}${src}')`; });
}
