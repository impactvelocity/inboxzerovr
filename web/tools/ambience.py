#!/usr/bin/env python3
"""Turn the ElevenLabs takes in web/tools/ambience-src into the Kyoto courtyard's ambience loops
and the katana's swing sounds, for the Unity game, the web build and vr3.

    python3 web/tools/ambience.py

For each layer (wind, leaves, bamboo, water, birds, crickets) it writes
  unity/Assets/Resources/Audio/Kyoto/<name>.wav       what KyotoAmbience.cs loads
  web/public/kyoto/audio/ambience/<name>.mp3          what src/kyoto/ambience.ts loads
  web/public/kyoto/audio/ambience/loops.json          each loop's exact length
  vr3/public/audio/ambience/                          a copy of the web files, for vr3/src/ambience.ts
and for each swing take, swing1.wav .. swing6.wav in all three builds' sound folders.

What it does to a take:
  1. filters it (rumble out, each layer kept to its own part of the spectrum);
  2. folds its tail into its head with an equal-power crossfade, so the clip is one period of a
     sound that repeats without a seam, whatever the take's own ends were like;
  3. evens out its loudness over the loop (the game moves each layer's volume with the wind, so a
     take's own swells would only mark where the loop comes round);
  4. sets it to the layer's loudness (LUFS), well clear of clipping.

MP3 decoders add a little silence at the ends, which would click in a loop. So the web files hold
the period with half a second of its own end before it and of its own start after it: any stretch
exactly one period long inside that loops cleanly, and loops.json says where to take it.

Needs ffmpeg (with libmp3lame) on the path; nothing else. To try another take, drop it in
ambience-src under the layer's name and run this again. The takes came from ElevenLabs sound
effects (eleven_text_to_sound_v2, loop on); the prompts are in LAYERS below.
"""
import array
import json
import math
import os
import re
import shutil
import subprocess
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ambience-src')
UNITY = os.path.join(HERE, '..', '..', 'unity', 'Assets', 'Resources', 'Audio', 'Kyoto')
WEB = os.path.join(HERE, '..', 'public', 'kyoto', 'audio', 'ambience')
VR3 = os.path.join(HERE, '..', '..', 'vr3', 'public', 'audio')
RATE = 44100
# the swing sounds: Unity's sound folder (first: it gets import settings), the web build's, and vr3's
SWING_OUT = [os.path.join(HERE, '..', '..', 'unity', 'Assets', 'Resources', 'Audio'),
             os.path.join(HERE, '..', 'public', 'kyoto', 'audio'), VR3]
SWING_FILTER = 'highpass=f=140'      # the takes are mostly thump below this, which a headset cannot play
SWING_LEVEL = -15                    # dBFS, the loudest eighth of a second
LEAD = 0.5        # seconds of the loop's own end before it (and of its start after it) in the web files

# name: channels, filter, crossfade seconds, how far to even out the level (0 none, 1 flat), LUFS, prompt
LAYERS = {
    'wind': dict(channels=2, fold=2.0, even=0.85, lufs=-27,
                 filter='highpass=f=90,equalizer=f=1850:t=q:w=1.6:g=-7',
                 prompt='Light airy breeze, soft hissing whoosh of moving air, high and breathy, steady, no low rumble, no leaves, no birds'),
    'leaves': dict(channels=1, fold=1.5, even=0.6, lufs=-27,
                   filter='highpass=f=220',
                   prompt='Tree leaves rustling softly in a light breeze, gentle dry shimmer of foliage, close, continuous, no birds'),
    'bamboo': dict(channels=1, fold=1.5, even=0.5, lufs=-29,
                   filter='highpass=f=160',
                   prompt='Bamboo grove swaying in a light wind, papery leaves hissing, hollow stalks creaking and knocking softly now and then'),
    'water': dict(channels=1, fold=1.0, even=0.3, lufs=-31,
                  filter='highpass=f=260,lowpass=f=5500',      # soft and a little far off, not a tap
                  prompt='Small garden pond, a thin trickle of water dripping into still water, quiet gentle lapping, close-mic, calm'),
    'birds': dict(channels=1, fold=0.6, even=0.0, lufs=-30,
                  filter='highpass=f=900',
                  prompt='A few small songbirds calling at dusk, sparse soft chirps far away, long quiet pauses between calls'),
    'crickets': dict(channels=2, fold=1.5, even=0.7, lufs=-33,
                     filter='highpass=f=2400,lowpass=f=10500',
                     prompt='Evening crickets chirping softly in a garden, sparse gentle chorus, distant, calm night air'),
}


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def decode(path, channels, chain):
    """The take as float samples, one array per channel."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-af', chain, '-ac', str(channels), '-ar', str(RATE),
                          '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    flat = array.array('f')
    flat.frombytes(raw)
    return [flat[c::channels] for c in range(channels)]


def fold(channel, overlap):
    """One period: the last `overlap` samples crossfaded into the first, equal power."""
    n = len(channel)
    out = array.array('f', channel[:n - overlap])
    for i in range(overlap):
        angle = (i + 0.5) / overlap * math.pi / 2
        out[i] = channel[n - overlap + i] * math.cos(angle) + channel[i] * math.sin(angle)
    return out


def even_out(channels, amount):
    """Flatten slow swells: divide by a smoothed loudness curve (taken round the loop), in part."""
    if amount <= 0:
        return channels
    n, hop = len(channels[0]), RATE // 4
    steps = max(1, n // hop)
    edges = [round(k * n / steps) for k in range(steps + 1)]
    power = []
    for k in range(steps):
        a, b = edges[k], edges[k + 1]
        power.append(sum(sum(x * x for x in ch[a:b]) for ch in channels) / ((b - a) * len(channels)))
    smooth = [sum(power[(k + j) % steps] for j in range(-5, 6)) / 11 for k in range(steps)]     # about 2.75 s wide
    level = [math.sqrt(max(p, 1e-12)) for p in smooth]
    middle = sorted(level)[steps // 2]
    gain = [min(4.0, max(0.25, (middle / v) ** amount)) for v in level]
    out = []
    for ch in channels:
        done = array.array('f', ch)
        for k in range(steps):
            a, b = edges[k], edges[k + 1]
            # from this step's middle to the next one's, round the loop
            g0, g1 = gain[k], gain[(k + 1) % steps]
            half = (b - a) // 2
            for i in range(a + half, b + half):
                done[i % n] = ch[i % n] * (g0 + (g1 - g0) * (i - a - half) / (b - a))
        out.append(done)
    return out


def write_wav(path, channels, gain=1.0, repeat=1, lead=0):
    """16-bit PCM. `lead` samples of the loop's own end go before it and of its start after."""
    n, count = len(channels[0]), len(channels)
    frames = array.array('h', bytes(2 * count * (n * repeat + 2 * lead)))
    at = 0
    for i in list(range(n - lead, n)) + list(range(n)) * repeat + list(range(lead)):
        for ch in channels:
            frames[at] = max(-32767, min(32767, round(ch[i] * gain * 32767)))
            at += 1
    if sys.byteorder == 'big':
        frames.byteswap()
    with wave.open(path, 'wb') as out:
        out.setnchannels(count)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(frames.tobytes())


META = """fileFormatVersion: 2
guid: {guid}
AudioImporter:
  externalObjects: {{}}
  serializedVersion: 8
  defaultSettings:
    serializedVersion: 2
    loadType: 1
    sampleRateSetting: 0
    sampleRateOverride: 44100
    compressionFormat: 1
    quality: 0.6
    conversionMode: 0
    preloadAudioData: 1
  platformSettingOverrides: {{}}
  forceToMono: 0
  normalize: 0
  loadInBackground: 1
  ambisonic: 0
  3D: 1
  userData:
  assetBundleName:
  assetBundleVariant:
"""
FOLDER_META = """fileFormatVersion: 2
guid: {guid}
folderAsset: yes
DefaultImporter:
  externalObjects: {{}}
  userData:
  assetBundleName:
  assetBundleVariant:
"""


def write_meta(path, text):
    """Unity's import settings for a new file: kept compressed in memory (Vorbis loops without a
    seam) and loaded off the main thread. A meta that is already there is Unity's to keep."""
    if not os.path.exists(path + '.meta'):
        with open(path + '.meta', 'w') as out:
            out.write(text.format(guid=os.urandom(16).hex()))


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBFS) of a file."""
    text = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                          capture_output=True, text=True).stderr
    summary = text[text.rindex('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1)), float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', summary).group(1))


def swings():
    """The katana's swing sounds: each take cut to the whoosh itself, faded at both ends and set to
    one loudness, as swing1.wav (the lightest flick) to swing6.wav (the longest sweep)."""
    made = []
    for index in range(1, 10):
        source = os.path.join(SRC, f'swing{index}.mp3')
        if not os.path.exists(source):
            break
        a = decode(source, 1, SWING_FILTER)[0]
        hop = RATE // 200
        level = [math.sqrt(sum(x * x for x in a[i:i + hop]) / hop) for i in range(0, len(a) - hop + 1, hop)]
        top = max(level)
        loud = [i for i, v in enumerate(level) if v > top * 10 ** (-32 / 20)]
        tail = [i for i, v in enumerate(level) if v > top * 10 ** (-42 / 20)]
        start = max(0, loud[0] * hop - RATE // 250)
        end = min(len(a), (tail[-1] + 1) * hop + RATE // 30)
        cut = array.array('f', a[start:end])
        rise, fall = RATE // 250, min(RATE // 20, len(cut) // 3)
        for i in range(rise):
            cut[i] *= 0.5 - 0.5 * math.cos(math.pi * i / rise)
        for i in range(fall):
            cut[len(cut) - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fall)
        # loudness: the loudest eighth of a second, so a long sweep and a flick hit as hard
        window = RATE // 8
        squares = [x * x for x in cut]
        running = best = sum(squares[:window])
        for i in range(window, len(squares)):
            running += squares[i] - squares[i - window]
            best = max(best, running)
        loudest = math.sqrt(best / min(window, len(cut)))
        gain = min(10 ** (SWING_LEVEL / 20) / loudest, 10 ** (-1.5 / 20) / max(abs(x) for x in cut))
        for folder in SWING_OUT:
            if not os.path.isdir(os.path.dirname(folder)):
                continue                      # a build that is not checked out here
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, f'swing{index}.wav')
            if folder == SWING_OUT[0]:
                write_meta(path, META.replace('loadType: 1', 'loadType: 0').replace('loadInBackground: 1', 'loadInBackground: 0'))
            write_wav(path, [cut], gain)
        made.append(index)
        print(f'swing{index}    {len(cut) / RATE:5.3f} s  gain {20 * math.log10(gain):+5.1f} dB')
    return made


def main():
    os.makedirs(UNITY, exist_ok=True)
    os.makedirs(WEB, exist_ok=True)
    write_meta(os.path.normpath(UNITY), FOLDER_META)
    swings()
    loops = {}
    for name, layer in LAYERS.items():
        source = os.path.join(SRC, name + '.mp3')
        if not os.path.exists(source):
            print(f'{name}: no take at {source}, skipped')
            continue
        channels = decode(source, layer['channels'], layer['filter'])
        channels = [fold(ch, int(layer['fold'] * RATE)) for ch in channels]
        channels = even_out(channels, layer['even'])
        n = len(channels[0])

        # measure over two turns of the loop, then set the level
        probe = os.path.join(WEB, name + '.probe.wav')
        write_wav(probe, channels, repeat=2)
        lufs, peak = loudness(probe)
        gain_db = min(layer['lufs'] - lufs, -3.0 - peak)
        gain = 10 ** (gain_db / 20)
        os.remove(probe)

        wav = os.path.join(UNITY, name + '.wav')
        write_meta(wav, META)
        write_wav(wav, channels, gain)
        lead = int(LEAD * RATE)
        padded = os.path.join(WEB, name + '.padded.wav')
        write_wav(padded, channels, gain, lead=lead)
        run('ffmpeg', '-v', 'error', '-y', '-i', padded, '-c:a', 'libmp3lame', '-b:a', '160k' if layer['channels'] == 2 else '96k',
            os.path.join(WEB, name + '.mp3'))
        os.remove(padded)
        loops[name] = {'seconds': n / RATE, 'lead': LEAD, 'channels': layer['channels']}
        after, after_peak = loudness(wav)
        print(f'{name:9s} {n / RATE:6.3f} s  {layer["channels"]} ch  {lufs:6.1f} -> {after:6.1f} LUFS  peak {after_peak:5.1f} dBFS')
    with open(os.path.join(WEB, 'loops.json'), 'w') as out:
        json.dump(loops, out, indent=1)
        out.write('\n')
    # vr3 plays the same loops (all but the bamboo: its garden has none)
    if os.path.isdir(os.path.dirname(VR3)):
        there = os.path.join(VR3, 'ambience')
        os.makedirs(there, exist_ok=True)
        for name in ['loops.json'] + [n + '.mp3' for n in loops if n != 'bamboo']:
            shutil.copyfile(os.path.join(WEB, name), os.path.join(there, name))


if __name__ == '__main__':
    main()
