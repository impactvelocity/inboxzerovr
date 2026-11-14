/**
 * How long each level's end song (its anthem) is, in seconds, by level id. The end of a game is fixed to this
 * (2026-11-13: "some times the songs at end are cutting off ... make that the fixed amount (not dynamic) per level"):
 * it dims to its darkest over the song, then goes to black and back to the home screen a second and a half after it
 * (letters.ts, AFTER_SONG). Measured from public/audio/<level>/anthem.m4a with afinfo; change it here when a song
 * changes. A level not listed (no end song) ends as before.
 */
export const ANTHEM_SECONDS: Record<string, number> = {
  kyoto: 20.82,
  office2: 18.54,      // (audio/office/anthem.m4a)
  castle: 19.99,
  lab: 22.02,
  space: 29.01,
  inferno: 19.61,
  lumber: 18.17,
};
