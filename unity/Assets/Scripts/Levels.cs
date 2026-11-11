using UnityEngine;

namespace InboxZero
{
    /// One level: a look, a weapon and a soundtrack around the same two rounds.
    /// The rules (Session) and the hands are shared by every level.
    public class Level
    {
        public string name;     // shown on the picker and the round intros
        public string weapon;   // what the right hand holds, as shown to the player
        public string music;    // a clip under Assets/Resources
        public Color accent;    // the level's main neon colour
        public Color second;    // the colour it is paired with
        public Color third;     // and the quiet one, for things in the background
        public bool ready;      // false: shown on the picker as coming soon
        public string world = "Space";  // what surrounds the seat: "Space" or "Kyoto"
        public string scene;            // for "Kyoto": the scene prefab under Assets/Resources; null is the Komorebi garden
        public string weaponModel;      // a model under Assets/Resources; null is the scene's saber
        public bool paper;              // emails are letters on paper, not cards of light
        public bool retro = true;       // the pixel-art screen treatment (RetroFx)
        public bool hum = true;         // the weapon hums like a saber
        public Color? trail;            // the colour a swing leaves in the air; null is the accent
    }

    /// What surrounds the seat. InboxGame tells it what is happening; how it
    /// answers (a surge of stars, a gust through a tree) is the level's own.
    public interface IWorld
    {
        void Show(bool on);
        /// A hit: a surge of energy. 1 is a solid hit.
        void Kick(float strength);
        /// A mistake washes the world in a colour for a moment.
        void Flash(Color tint);
        /// Something to celebrate, `count` times over.
        void Wish(int count = 1);
        /// Whether a session is under way (anything but the home screen).
        void Round(bool underway);
        /// `beat` is the music's pulse and `energy` the player's streak, both 0..1.
        void Step(float dt, float targetSpeed, float beat, float energy);
    }

    public static class Levels
    {
        public static readonly Level[] All =
        {
            new Level
            {
                name = "RETRO SABER", weapon = "ENERGY SABER", music = "Audio/RetroSaberMusic",
                accent = Look.Hex(0xff4d8d), second = Look.Hex(0x9b5cff), third = Look.Hex(0x5b3fd9), ready = true,
            },
            // Slots for the levels to come. Give one a name, a weapon and music and
            // set `ready` once InboxGame can dress the scene for it.
            // A Kyoto courtyard at dusk, seen from the veranda. Night comes on as
            // the round goes; the emails are letters and the weapon is a katana.
            // No music yet: the courtyard is quiet until it has a track of its own.
            new Level
            {
                name = "KYOTO DUSK", weapon = "KATANA", music = null,
                accent = Look.Hex(0xff9ec4), second = Look.Hex(0xffb070), third = Look.Hex(0x6f7dc6), ready = true,
                world = "Kyoto", weaponModel = "Kyoto/Katana", paper = true, retro = false, hum = false,
                trail = Look.Hex(0xfff0f6),
            },
            // Kyoto v2: the first courtyard again (veranda, machiya, walls and gate
            // from Blender), replanted with the Komorebi pack and lit live: dusk
            // sinking into a violet night, lamps, bloom and mist.
            new Level
            {
                name = "KYOTO V2", weapon = "KATANA", music = null,
                accent = Look.Hex(0xff8fb8), second = Look.Hex(0xffa860), third = Look.Hex(0x7a6ad8), ready = true,
                world = "Kyoto", scene = "KyotoV2/Courtyard", weaponModel = "Kyoto/Katana", paper = true, retro = false, hum = false,
                trail = Look.Hex(0xfff0f6),
            },
            new Level { name = "COMING SOON", accent = Look.Green, second = Look.Cyan },
        };
    }
}
