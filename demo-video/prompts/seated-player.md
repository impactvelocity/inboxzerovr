# Seated player clip (Higgsfield)

Settings: 16:9, 1080p, 5 seconds, static camera. Save the result as `demo-video/work/assets/seated.mp4`.

## Option A: one prompt (text to video)

```
3D render, static camera, 5 seconds. Side three-quarter view of a person seated in a simple modern chair, drawn as a Meta Quest style avatar: a smooth, faceless, pale-blue figure with a soft white glowing outline, like Meta Quest hand-tracking hands, wearing a sleek VR headset. The left hand is empty; the right hand holds a katana with a dark wrapped handle and gold guard. Two cream paper email cards with a hot pink label stripe and grey text lines float in from the right and glide up to arm's reach. At 2 seconds the left hand reaches out, grabs the nearer email and pulls it close to read. At 3 seconds the right hand swings the katana in a fast diagonal slash with a short hot-pink light trail; the blade stretches longer as it swings and chops the second email into paper pieces that flutter down. The player stays seated the whole time. Playful, smooth, video game trailer feel, soft studio lighting, crisp silhouette. Solid flat chroma green background (#00B140), evenly lit, no floor, no green on the figure or props.
```

## Option B: image first, then animate (more control)

Step 1, image prompt:

```
3D render, side three-quarter view of a person seated in a simple modern chair, drawn as a Meta Quest style avatar: a smooth, faceless, pale-blue figure with a soft white glowing outline, like Meta Quest hand-tracking hands, wearing a sleek VR headset. Relaxed seated pose facing right, left hand resting on the knee, right hand loosely holding a katana with a dark wrapped handle and gold guard, blade pointed down. Two small cream paper email cards with a hot pink label stripe and grey text lines float in the distance to the right. Soft studio lighting, crisp silhouette, full body in frame, empty space on the right. Solid flat chroma green background (#00B140), evenly lit, no floor, no green on the figure or props.
```

Step 2, video prompt (use the image as the start frame):

```
Static camera, no cuts. The seated VR player stays in the chair. The two email cards float in from the right and glide up to arm's reach, bobbing gently. At 2 seconds the left hand reaches out, grabs the nearer email and pulls it close to read. At 3 seconds the right hand swings the katana in a fast diagonal slash with a short hot-pink light trail; the blade stretches longer as it swings and chops the second email into paper pieces that flutter down. Ends relaxed, holding the email and the katana. Smooth, playful, video game trailer feel. Solid flat chroma green background throughout.
```

## Negative prompt (if there's a field for it)

```
camera movement, zoom, cuts, standing up, realistic face, skin, clothing detail, text, logos, watermark, extra hands, extra limbs, extra swords, green on the figure, green glow, light spill, motion blur, shadows on the background, floor, gradient background
```

## If it looks muddy after the green is removed

Add this to the end of the prompt:

```
Solid matte opaque body, crisp hard edges, no transparency, no glow spill.
```

## White background instead (no green screen needed)

The film's scene is plain white, so this drops straight in. Use Option A or B, and replace the background sentence with:

```
Seamless pure white studio background (#FFFFFF), soft contact shadow under the chair.
```

and replace "pale-blue figure with a soft white glowing outline" with:

```
matte deep indigo figure (#3b2f52) with a pale-blue rim light
```
