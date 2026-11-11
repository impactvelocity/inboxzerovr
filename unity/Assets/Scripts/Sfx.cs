using System;
using System.Collections.Generic;
using UnityEngine;

namespace InboxZero
{
    /// Sound for the level. Bare hands have no haptics, which makes these the
    /// main "it hit" feedback.
    ///
    /// The sounds (slash1, slash2, wrong, sort, arrive, blip, done) and the music
    /// are files in Assets/Resources/Audio. The blade's hum and the ping that
    /// climbs with a combo are synthesised here. Any file that is missing falls
    /// back to a synthesised sound.
    public class Sfx
    {
        const int Rate = 44100;
        const float Master = 0.5f;
        enum Wave { Sine, Triangle, Square, Sawtooth }
        enum Filter { Lowpass, Highpass, Bandpass }

        public bool muted;
        readonly AudioSource source;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        readonly System.Random random = new System.Random(7);
        List<float> mix;

        const float MusicVolume = 0.42f;
        static readonly string[] Files = { "slash1", "slash2", "wrong", "sort", "arrive", "blip", "done" };
        readonly Dictionary<string, AudioClip> files = new Dictionary<string, AudioClip>();
        readonly List<AudioSource> voices = new List<AudioSource>(); // for sounds that change pitch
        readonly float[] spectrum = new float[256];
        int nextVoice;
        AudioSource music, hum;
        bool musicOn;
        float humLevel, loudest = 1e-4f;

        /// The music's pulse, 0..1: it jumps on a bass hit and falls away after.
        public float Beat { get; private set; }

        public Sfx(AudioSource source)
        {
            this.source = source;
            foreach (var name in Files)
            {
                var clip = Resources.Load<AudioClip>("Audio/" + name);
                if (clip != null) files[name] = clip;
            }
        }

        AudioSource AddSource(bool loop)
        {
            var added = source.gameObject.AddComponent<AudioSource>();
            added.playOnAwake = false;
            added.spatialBlend = 0;
            added.loop = loop;
            return added;
        }

        /// Play a sound file at a pitch. False if there is no such file.
        bool PlayFile(string name, float pitch = 1, float volume = 1)
        {
            if (!files.TryGetValue(name, out var clip)) return false;
            if (muted || source == null) return true;
            if (voices.Count < 5) voices.Add(AddSource(false));
            var voice = voices[nextVoice++ % voices.Count];
            voice.pitch = pitch;
            voice.PlayOneShot(clip, volume);
            return true;
        }

        /// Start a level's music (a clip under Resources), or stop it with null.
        /// It fades in and out; call Step every frame.
        public void Music(string clipPath)
        {
            bool on = clipPath != null;
            if (muted || source == null || on == musicOn) return;
            musicOn = on;
            if (!on) return;
            var clip = Resources.Load<AudioClip>(clipPath);
            if (clip == null) { musicOn = false; return; }
            if (music == null) music = AddSource(true);
            music.clip = clip;
            music.volume = 0;
            music.time = 0;
            music.Play();
        }

        /// The blade's idle hum. It rises in pitch and volume with `speed`, the
        /// blade tip's speed in m/s, so a swing sweeps past the ear.
        public void Hum(bool on, float speed)
        {
            if (muted || source == null) return;
            if (hum == null)
            {
                if (!on) return;
                hum = AddSource(true);
                hum.clip = BuildHum();
                hum.volume = 0;
            }
            float swing = Mathf.Clamp01(speed / 7);
            humLevel = on ? 0.1f + 0.5f * swing : 0;
            hum.pitch = Mathf.Lerp(hum.pitch, 1 + 0.5f * swing, 0.35f);
            if (on && !hum.isPlaying) hum.Play();
        }

        /// Two seconds of electric hum that loops without a seam: a low buzz
        /// with a slow waver, every part of it a whole number of cycles long.
        static AudioClip BuildHum()
        {
            int count = Rate * 2;
            var data = new float[count];
            for (int i = 0; i < count; i++)
            {
                double t = i / (double)Rate, sample = 0;
                double waver = 0.5 * Math.Sin(2 * Math.PI * 0.5 * t);
                for (int h = 1; h <= 9; h++)
                    sample += Math.Sin(2 * Math.PI * 55 * h * t + waver * h * 0.2) / h * (h % 2 == 0 ? 0.55 : 1);
                sample += 0.3 * Math.Sin(2 * Math.PI * 82.5 * t);
                double tremble = 0.8 + 0.2 * Math.Sin(2 * Math.PI * 3.5 * t);
                data[i] = (float)(sample * 0.2 * tremble);
            }
            var clip = AudioClip.Create("BladeHum", count, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        public void Step(float dt)
        {
            if (hum != null)
            {
                hum.volume = Mathf.MoveTowards(hum.volume, humLevel, dt * (humLevel > hum.volume ? 6 : 1.5f));
                if (humLevel <= 0 && hum.volume <= 0 && hum.isPlaying) hum.Stop();
            }
            Beat = Mathf.Max(0, Beat - dt * 3.5f);
            if (music == null) return;
            music.volume = Mathf.MoveTowards(music.volume, musicOn ? MusicVolume : 0, dt * (musicOn ? 0.6f : 0.35f));
            if (!musicOn && music.volume <= 0 && music.isPlaying) music.Stop();
            if (!music.isPlaying) return;
            // Listen to the bass: a level well above its recent loudest is a beat.
            music.GetSpectrumData(spectrum, 0, FFTWindow.Hanning);
            float bass = spectrum[1] + spectrum[2] + spectrum[3];
            loudest = Mathf.Max(loudest * (1 - dt * 0.4f), bass);
            float hit = bass / loudest;
            if (hit * hit > Beat) Beat = hit * hit;
        }

        void Tone(Wave wave, float from, float to, float seconds, float gain, float delay = 0)
        {
            to = Mathf.Max(20, to);
            int start = (int)(delay * Rate), count = (int)(seconds * Rate);
            while (mix.Count < start + count) mix.Add(0);
            double phase = 0;
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)count;
                double hz = from * Math.Pow(to / from, t);
                phase += hz / Rate;
                double p = phase - Math.Floor(phase);
                double s =
                    wave == Wave.Sine ? Math.Sin(p * 2 * Math.PI) :
                    wave == Wave.Triangle ? 1 - 4 * Math.Abs(p - 0.5) :
                    wave == Wave.Square ? (p < 0.5 ? 1 : -1) :
                    2 * p - 1;
                mix[start + i] += (float)(s * gain * Math.Pow(0.001 / gain, t));
            }
        }

        /// Filtered noise whose filter sweeps from one frequency to another.
        void Burst(Filter filter, float from, float to, float seconds, float gain)
        {
            int count = (int)(seconds * Rate);
            while (mix.Count < count) mix.Add(0);
            double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            double b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)count;
                if (i % 16 == 0)
                {
                    double w = 2 * Math.PI * Math.Min(from * Math.Pow(to / from, t), Rate * 0.45) / Rate;
                    double cos = Math.Cos(w), alpha = Math.Sin(w) / 2; // Q = 1
                    double a0 = 1 + alpha;
                    if (filter == Filter.Lowpass) { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
                    else if (filter == Filter.Highpass) { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
                    else { b0 = alpha; b1 = 0; b2 = -alpha; }
                    b0 /= a0; b1 /= a0; b2 /= a0; a1 = -2 * cos / a0; a2 = (1 - alpha) / a0;
                }
                double x = random.NextDouble() * 2 - 1;
                double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
                x2 = x1; x1 = x; y2 = y1; y1 = y;
                mix[i] += (float)(y * gain * Math.Pow(0.001 / gain, t));
            }
        }

        void Play(string key, Action build)
        {
            if (muted || source == null) return;
            if (!clips.TryGetValue(key, out var clip))
            {
                mix = new List<float>();
                build();
                var data = mix.ToArray();
                for (int i = 0; i < data.Length; i++) data[i] = Mathf.Clamp(data[i] * Master, -1, 1);
                clip = AudioClip.Create(key, data.Length, 1, Rate, false);
                clip.SetData(data, 0);
                clips[key] = clip;
            }
            source.PlayOneShot(clip);
        }

        static float Climb(int combo) => Mathf.Pow(2, Mathf.Min(combo, 12) / 12f);

        /// A little ping that climbs the scale as a combo grows.
        void Ping(int combo) =>
            Play("ping" + Mathf.Min(combo, 12), () => Tone(Wave.Triangle, 520 * Climb(combo), 1040, 0.12f, 0.2f));

        /// Blade through an email. Two takes, picked at random, so it never repeats exactly.
        public void Slash(int combo)
        {
            string take = UnityEngine.Random.value < 0.5f ? "slash1" : "slash2";
            float pitch = UnityEngine.Random.Range(0.94f, 1.06f) + Mathf.Min(combo, 12) * 0.012f;
            if (PlayFile(take, pitch)) Ping(combo);
            else Play("slash" + Mathf.Min(combo, 12), () =>
            {
                Burst(Filter.Bandpass, 5200, 900, 0.16f, 0.9f);
                Tone(Wave.Triangle, 520 * Climb(combo), 1040, 0.12f, 0.25f);
            });
        }

        /// A card sent on its way: kept, replied to, or left for tomorrow.
        public void Sort(int combo)
        {
            if (PlayFile("sort", UnityEngine.Random.Range(0.97f, 1.05f), 0.8f)) { Ping(combo); return; }
            Play("sort" + Mathf.Min(combo, 12), () =>
            {
                float b = 440 * Climb(combo);
                Tone(Wave.Sine, b, b * 1.5f, 0.12f, 0.3f);
                Tone(Wave.Sine, b * 1.5f, b * 2, 0.14f, 0.25f, 0.08f);
            });
        }

        public void Wrong()
        {
            if (PlayFile("wrong")) return;
            Play("wrong", () =>
            {
                Tone(Wave.Sawtooth, 180, 90, 0.32f, 0.35f);
                Tone(Wave.Square, 120, 70, 0.32f, 0.2f);
            });
        }

        public void Arrive()
        {
            if (PlayFile("arrive", UnityEngine.Random.Range(0.94f, 1.08f), 0.55f)) return;
            Play("arrive", () => Burst(Filter.Highpass, 1800, 4200, 0.07f, 0.12f));
        }

        /// An email left alone, rushing past.
        public void Pass()
        {
            if (PlayFile("arrive", 0.68f, 0.5f)) return;
            Play("pass", () => Burst(Filter.Highpass, 3200, 900, 0.18f, 0.14f));
        }

        /// A small console beep: taking hold of a card, pressing a button.
        public void Blip(float pitch = 1)
        {
            if (PlayFile("blip", pitch, 0.6f)) return;
            Play("blip", () => Tone(Wave.Sine, 300, 380, 0.06f, 0.18f));
        }

        /// The inbox is clear.
        public void Done()
        {
            if (PlayFile("done")) return;
            Play("fanfare", () =>
            {
                float[] notes = { 523, 659, 784, 1047 };
                for (int i = 0; i < notes.Length; i++) Tone(Wave.Triangle, notes[i], notes[i], 0.3f, 0.3f, i * 0.11f);
                Tone(Wave.Sine, 1047, 2094, 0.7f, 0.2f, 0.44f);
            });
        }
    }
}
