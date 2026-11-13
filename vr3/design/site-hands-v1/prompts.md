# Hands for the site's "How it works"

Five pictures of Meta Quest hands doing the game's five moves. They sit in dark square tiles in the
controls part of the front page (`app/page.tsx`, `HandShot`).

**Made on 2026-11-12:** all five are in `public/site/hands/` as PNGs. The page shows four: grab, read, throw, and `right-destroy` as the right hand's one tile (it has the slash and the cut in it). `right-slash.png` is not shown: a grey-white cloud was left round the hand where the background should be clear. To replace one, save a transparent PNG over it at the path given. The page picks it up on the next load, with no
code change. Until a file exists, its tile shows a small pixel icon instead.

| File | Hand | Move |
| --- | --- | --- |
| `public/site/hands/left-grab.png` | Left | Grab |
| `public/site/hands/left-read.png` | Left | Read |
| `public/site/hands/left-throw.png` | Left | Throw |
| `public/site/hands/right-slash.png` | Right | Slash |
| `public/site/hands/right-destroy.png` | Right | Destroy |

Make all five in one sitting, each from the same style block, so the hand, the email and the light
match. Generating the first one and giving it to the model as the reference for the other four
works best.

## Style block (start every prompt with this)

> First-person view from a VR headset. One Meta Quest tracked hand, drawn the way the Quest shows
> your hands in VR: a smooth, simplified hand with no skin texture, no fingernails, no wrinkles and
> no jewellery, dark translucent charcoal inside, with a clean glowing white-blue outline along
> every edge and a faint inner glow at the fingertips. Five fingers, correct anatomy. The forearm
> ends at the wrist, cut off by the edge of the picture.
>
> The email is a small landscape paper card, warm cream (#f7efe6), slightly rounded corners, with
> one small solid colour tag in its top left corner and two short dark bars standing in for lines
> of text. No readable words, no letters, no logos.
>
> Clean vector-like 3D render with soft glow, a slight hint of pixel art in the sparkles only.
> Square 1024x1024 canvas. The subject fills about 80% of it, with clear space on every side.
> Real transparent PNG alpha background. No black rectangle, no checkerboard, no floor, no scene,
> no shadow on a ground, no border, no text, no watermark.

## The five shots

**left-grab.png**

> A LEFT hand comes in from the bottom left corner, palm facing away from the viewer, fingers open
> and curling as it reaches forward. A little way beyond the fingertips floats the cream email
> card, small, tilted slightly, with an orange tag. A thin glowing mint-green (#4ff3c8) line runs
> from the palm to the card, showing the hand's reach. The card has a soft mint glow where the line
> meets it.

**left-read.png**

> The same LEFT hand, from the bottom left corner, now holding the cream email card by its lower
> left corner between thumb and fingers. The card is large and faces the viewer squarely, filling
> the upper right two thirds of the picture, close enough to read. It has a pink tag and two dark
> text bars. A soft mint-green (#4ff3c8) glow sits around the card's edge.

**left-throw.png**

> The same LEFT hand, from the bottom left corner, just after a throw: arm extended up and to the
> right, fingers flung open and spread. The cream email card is flying away toward the top right
> corner, small and spinning, wearing a bright gold (#ffd24a) glowing edge. Three short gold motion
> streaks trail behind it, with a few tiny gold pixel sparkles.

**right-slash.png**

> A RIGHT hand comes in from the bottom right corner, gripping the handle of a katana: dark wrapped
> grip, small round gold guard, slim steel blade with a pale pink edge. The blade crosses the
> picture on a diagonal from lower right to upper left, mid-swing, with a bright hot-pink (#ff2e93)
> crescent of motion blur trailing behind it. The cream email card floats whole at the centre, a
> red tag on it, with the blade's edge just reaching it.

**right-destroy.png**

> The same RIGHT hand and katana from the bottom right corner, at the end of the swing, blade now
> low on the left. At the centre the cream email card is cut cleanly in two along a diagonal, the
> two halves drifting apart, a red tag on one half. A thin bright white and hot-pink (#ff2e93) line
> marks the cut. Pink cherry-blossom petals and a few tiny pink pixel sparks burst from the gap.

## Checks before saving

- The left hand is a left hand (thumb on the right side when the palm faces away) and the right is
  a right. Image models swap these often.
- Five fingers on each.
- The background is truly transparent: open it over a dark colour and a light one.
- No words on the card.
- The hand and the card look the same across all five.
