using UnityEngine;

namespace InboxZero
{
    /// What the v2 courtyard sounds like: a breeze, the cherry's leaves, the bamboo by the left
    /// wall, the pond, a few birds while there is light and crickets as it goes. No music: that
    /// is the level's own (Level.music), and this sits under it.
    ///
    /// Each sound is a loop in Assets/Resources/Audio/Kyoto, placed in the garden where the thing
    /// that makes it stands, so it stays put as the head turns. The loops are ElevenLabs sound
    /// effects, cut and levelled by web/tools/ambience.py (which also says how to swap a take).
    ///
    /// The courtyard drives it with the numbers it already has: the wind that bends the trees
    /// sets how loud the leaves are, and the evening's fade takes the birds out and brings the
    /// crickets in. The web build's copy is web/src/kyoto/ambience.ts.
    public sealed class KyotoAmbience
    {
        /// The whole soundscape's volume. The music plays at 0.42.
        public const float Volume = 0.7f;

        sealed class Layer
        {
            public string name;
            public AudioSource source;
            public float level;
        }

        readonly Layer wind, leaves, bamboo, water, birds, crickets;
        readonly Layer[] all;
        float heard;        // 0 to 1: fades in when the scene opens, out when it is told to be quiet

        /// `scene` is the courtyard's root; the sounds are placed in its space (x right, z towards the gate).
        public KyotoAmbience(Transform scene)
        {
            var root = new GameObject("Ambience").transform;
            root.SetParent(scene, false);
            Layer Add(string name, Vector3? at, float spread)
            {
                var clip = Resources.Load<AudioClip>("Audio/Kyoto/" + name);
                if (clip == null) return new Layer { name = name };      // not made yet: that layer is silent
                var go = new GameObject(name);
                go.transform.SetParent(root, false);
                var source = go.AddComponent<AudioSource>();
                source.clip = clip;
                source.loop = true;
                source.playOnAwake = true;          // so it starts again each time the scene is shown
                source.volume = 0;
                source.priority = 200;              // the game's own sounds come first
                source.dopplerLevel = 0;
                source.reverbZoneMix = 0;
                if (at.HasValue)
                {
                    go.transform.localPosition = at.Value;
                    source.spatialBlend = 1;
                    source.spread = spread;
                    // The seat does not move, so distance is not what tells these apart: direction is.
                    source.rolloffMode = AudioRolloffMode.Linear;
                    source.minDistance = 60;
                    source.maxDistance = 120;
                }
                else source.spatialBlend = 0;
                // Not all from the top: the loops are different lengths and should never line up.
                source.time = Random.value * clip.length * 0.9f;
                source.Play();
                return new Layer { name = name, source = source };
            }
            wind = Add("wind", null, 0);
            leaves = Add("leaves", new Vector3(-4.2f, 4.6f, 8.2f), 110);     // the cherry's canopy
            bamboo = Add("bamboo", new Vector3(-5.6f, 3.0f, 4.4f), 70);      // the stand along the left wall
            water = Add("water", new Vector3(2.45f, -0.1f, 5.6f), 40);       // the lily pond by the machiya
            birds = Add("birds", new Vector3(9f, 7f, 18f), 60);              // past the back wall, to the right
            crickets = Add("crickets", null, 0);
            all = new[] { wind, leaves, bamboo, water, birds, crickets };
        }

        /// Every frame. `evening` is the scene's eased fade (0 the sun up, 1 night); `swell` the
        /// wind's slow rise and fall and `force` its strength as the trees feel it (0.85 still air,
        /// about 2.8 a strong gust), both as KyotoCourtyard works them out; `clock` its time.
        public void Step(float dt, float evening, float swell, float force, float clock, bool quiet)
        {
            heard = Mathf.MoveTowards(heard, quiet ? 0 : 1, dt * (quiet ? 2f : 0.45f));
            float blow = Mathf.Clamp01((force - 0.85f) / 1.9f);
            // The bamboo stands upwind of the tree and is its own plant: partly the same wind, partly its own.
            float stand = 0.5f * blow + 0.5f * Mathf.PerlinNoise(clock * 0.07f, 21.4f);
            // Birds come and go while there is light, and are gone when the scene's own birds are (0.42).
            float calling = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.35f, 0.6f, Mathf.PerlinNoise(clock * 0.05f, 5.5f)));
            Set(wind, 0.5f + 0.5f * swell, dt);
            Set(leaves, 0.3f + 0.7f * blow, dt);
            Set(bamboo, 0.3f + 0.6f * stand, dt);
            Set(water, 0.17f + 0.05f * Mathf.PerlinNoise(clock * 0.04f, 9.1f), dt);    // barely there: heard only when listened for
            Set(birds, (1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.18f, 0.42f, evening))) * calling, dt);
            Set(crickets, Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0.12f, 0.5f, evening)) * 0.85f, dt);
            // A breath of pitch on the two wind sounds, so a loop coming round is never quite the same.
            if (wind.source != null) wind.source.pitch = 0.97f + 0.06f * Mathf.PerlinNoise(clock * 0.03f, 14.2f);
            if (leaves.source != null) leaves.source.pitch = 0.97f + 0.07f * blow;
        }

        void Set(Layer layer, float level, float dt)
        {
            if (layer.source == null) return;
            layer.level = Mathf.MoveTowards(layer.level, level, dt * 0.8f);
            layer.source.volume = layer.level * heard * Volume;
        }

        /// The scene has been hidden and shown again: come back in gently.
        public void Reset()
        {
            heard = 0;
            foreach (var layer in all)
                if (layer.source != null) layer.source.volume = 0;
        }
    }
}
