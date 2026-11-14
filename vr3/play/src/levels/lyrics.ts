/**
 * The words of each level's end song (its anthem), word by word, for the end of a game (v2, src/endlyrics.ts):
 * [seconds into the song when the word is sung, the word], one array per line as it is sung.
 *
 * Made 2026-11-13 from the user's own songs with ElevenLabs Scribe (speech to text, word timings; the raw replies are
 * tools/level-src/<level>/anthem-scribe.json), the lines as on the lyrics page (claude.ai/artifact/584Q6cQyf3G1LDzW35dLci).
 * Kyoto's chorus was heard as Japanese, so its words and their times are set by hand (its later choruses roughly).
 * Keyboard Smash's are shown on its monitor, one word at a time, as it hangs over the desk (props/crt.ts): its end is the monitor's.
 */
export type LyricLine = [number, string][];
export const ANTHEM_LYRICS: Record<string, LyricLine[]> = {
  kyoto: [
    [[1.7, "Kyoto,"], [2.32, "Kyoto,"], [2.98, "inbox"], [4.02, "zero."]],
    [[5.08, "Kyoto,"], [5.72, "Kyoto,"], [6.34, "inbox"], [7.42, "zero."]],
    [[8.1, "We"], [8.66, "made"], [8.94, "the"], [9.12, "order,"], [10.2, "we"], [10.36, "claim"], [10.64, "the"], [10.84, "day."]],
    [[12.32, "Kyoto,"], [12.62, "Kyoto,"], [12.9, "inbox"], [13.3, "zero."]],
    [[14.6, "We"], [15.06, "made"], [15.56, "our"], [15.9, "way!"]]
  ],
  castle: [
    [[2.28, "Win"], [2.5, "the"], [2.7, "night,"]],
    [[3.96, "win"], [4.16, "the"], [4.36, "fight."]],
    [[5.18, "Zero"], [6.88, "Hero."]],
    [[8.7, "Inbox"], [10.18, "Zero"], [11.4, "tonight!"]]
  ],
  lab: [
    [[1.06, "Toxic,"], [1.6, "toxic."]],
    [[2.68, "Danger,"], [3.48, "danger."]],
    [[5.1, "Radioactive"], [6.98, "inbox"], [7.74, "zero."]],
    [[10.18, "Inbox"], [10.94, "zero."]]
  ],
  space: [
    [[2.06, "Space,"], [2.4, "space."]],
    [[3.48, "Super"], [4.04, "space."]],
    [[5.22, "Deep"], [5.56, "space"], [6.08, "laser"], [6.9, "sword."]],
    [[8.62, "Warp"], [8.96, "speed"], [9.3, "to"], [9.58, "inbox"], [10.36, "zero."]],
    [[12.02, "Zero."]]
  ],
  inferno: [
    [[2.3, "Burn,"], [2.7, "burn."]],
    [[3.98, "Inferno."]],
    [[5.52, "Burn."]],
    [[6.8, "Inbox"], [7.54, "zero."]]
  ],
  lumber: [
    [[1.02, "Chop"], [1.42, "chop,"], [1.86, "to"], [2.06, "the"], [2.18, "top."]],
    [[2.48, "Every"], [2.68, "thread"], [2.98, "is"], [3.18, "on"], [3.32, "the"], [3.42, "block."]],
    [[4.32, "Chop"], [4.72, "chop,"], [4.98, "we'll"], [5.18, "never"], [5.46, "stop."]],
    [[5.76, "Chop"], [5.98, "chop"], [6.22, "to"], [6.4, "inbox"], [6.86, "zero!"]]
  ],
  office2: [
    [[1.76, "Smash,"], [2.28, "smash"], [2.74, "keyboard."]],
    [[3.4, "Smash"], [4.2, "it"], [4.64, "all"], [5.06, "away."]],
    [[9.48, "No"], [9.72, "more"], [10.0, "email"], [10.42, "tonight."]],
    [[11.6, "Inbox"], [12.42, "zero."]],
    [[15.82, "We"], [16.04, "won!"]]
  ],
};
