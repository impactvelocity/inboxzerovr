#!/usr/bin/env python3
"""The sound of the office, the castle and the lab: tools/level-src/<level> to public/audio/<level>.

    python3 vr3/tools/levelsounds.py              build all three levels
    python3 vr3/tools/levelsounds.py lab          build one
    python3 vr3/tools/levelsounds.py --measure    measure the raw takes (nothing is written)

Every take is an ElevenLabs sound effect (eleven_text_to_sound_v2); its prompt is beside it in
SETS below. For each level this writes, into vr3/public/audio/<level>/:

  <loop>.mp3   an ambience loop: one period of the sound with half a second of itself either side
               (MP3 decoders pad the ends; see ../../web/tools/ambience.py, whose functions do the work)
  <shot>.wav   a one-shot, cut to the sound itself, faded at both ends, set to a peak level
  hum.mp3      the level's held-trigger loop (the castle sword's hum, the lab sprayer's hiss), same format as a loop
  set.json     {"loops": {name: {seconds, lead, channels}}, "shots": [names], "occasional": [names], "hum": {seconds, lead} or null}

"occasional" names the shots that are background events (a fax, a door) rather than the player's own.
To try another take, replace tools/level-src/<level>/<name>.mp3 and run this again. Nothing here
was chosen by ear: takes were picked by the numbers --measure prints.
"""
import array
import json
import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'web', 'tools'))
import ambience as A  # noqa: E402

SRC = os.path.join(HERE, 'level-src')
OUT = os.path.join(HERE, '..', 'public', 'audio')
RATE = A.RATE
LEAD = A.LEAD

# A headset's speakers play little under 150 Hz, and these generators like to fill a take with
# rumble: every chain starts by taking it out.
#
# loops:  channels, filter, fold (crossfade seconds), even (0 none .. 1 flat), lufs, prompt
# shots:  filter, peak (dBFS), prompt; optional window (from, to seconds of the take to use),
#         start / end (dB below the take's loudest 5 ms at which the sound is taken to begin / be over),
#         longest (seconds: cut there with a fade), copy (a file to copy as it is instead of a take)
# hum:    as a loop, mono; optional source (a path, if the take lives elsewhere)
# loops and hum: optional window (from, to seconds of the take to use)
SETS = {
    # A vast empty 1990s open-plan office with one beige CRT.
    'office': dict(
        loops={
            'room': dict(channels=2, fold=2.0, even=0.85, lufs=-27,
                         filter='highpass=f=160,highpass=f=160,equalizer=f=250:t=q:w=1.0:g=-4,treble=g=5:f=3500',
                         # (first try, "Empty open-plan office room tone, soft airy air-conditioning hiss and a faint high
                         # fluorescent tube buzz...", came back as near silence at -70 dBFS, and as hiss that stops half way)
                         prompt='Steady air conditioning hiss from a ceiling vent in a quiet office, constant soft broadband whoosh of moving air, even and continuous for the whole clip, mid and high frequencies, no rumble, no voices, no clicks'),
            'typing': dict(channels=1, fold=1.2, even=0.25, lufs=-31,
                           filter='highpass=f=350',
                           prompt='A few office workers typing on old clacky mechanical computer keyboards a few desks away, irregular bursts of key clicks with short pauses, dry, no voices, no music'),
            'voices': dict(channels=2, fold=2.0, even=0.6, lufs=-32,
                           filter='highpass=f=220,lowpass=f=5200',
                           # (first try, "Distant indistinct murmur of a few office workers talking calmly across a large
                           # open-plan office, unintelligible walla, soft and far away", was mostly rumble under 150 Hz)
                           prompt='Office walla: several people chatting quietly at a distance in a large room, indistinct conversational murmur of mid-range voices, continuous, calm, no music, no laughter'),
        },
        shots={
            'fax': dict(peak=-10, filter='highpass=f=200', start=-20, end=-40,
                        prompt='Old fax machine: modem handshake tones and screech, then paper feeding out with a mechanical whirr'),
            'printer': dict(peak=-10, filter='highpass=f=200', start=-14, end=-40,      # the take idles for half a second first
                            prompt='Dot-matrix printer printing a short burst of lines, buzzing print head zipping back and forth, then stops'),
            'phone': dict(peak=-10, filter='highpass=f=300', end=-40,
                          prompt='Old office desk telephone ringing twice with a mechanical bell, a little distant in a large room'),
            'arrive': dict(peak=-4, filter='highpass=f=250', start=-18, longest=0.7,
                           prompt='Retro 1990s computer new-mail notification blip with a tiny CRT static pop, short, bright, close'),
            'slash1': dict(peak=-4, filter='highpass=f=180', longest=0.8,
                           prompt='A plastic computer keyboard smashed hard against a desk, one sharp plastic crack with keys rattling and scattering, short, dry, close'),
            'slash2': dict(peak=-4, filter='highpass=f=180', longest=0.8,
                           prompt='(a second take of slash1)'),
            'arm': dict(peak=-4, filter='highpass=f=300', start=-16, longest=0.25,     # begins at the clack, not the touch before it
                        prompt='A single heavy mechanical keyboard key pressed once, one loud clack, close, dry'),
            # the second office's monitor: not takes, tools/crtsounds.py makes them (run that first)
            'crton': dict(copy=os.path.join(SRC, 'office', 'crton.wav'), prompt='(made by tools/crtsounds.py)'),
            'crtoff': dict(copy=os.path.join(SRC, 'office', 'crtoff.wav'), prompt='(made by tools/crtsounds.py)'),
            'glass': dict(copy=os.path.join(SRC, 'office', 'glass.wav'), prompt='(made by tools/crtsounds.py)'),
            'zap': dict(copy=os.path.join(SRC, 'office', 'zap.wav'), prompt='(made by tools/crtsounds.py)'),
        },
        occasional=['fax', 'printer', 'phone'],
        hum=None,
    ),
    # A haunted candlelit Gothic stone corridor at night.
    'castle': dict(
        loops={
            # a gusty take, 25 dB between gust and lull: a slow compressor and the evening-out leave it a draught that comes and goes
            'hall': dict(channels=2, fold=2.0, even=0.75, lufs=-27,
                         filter='highpass=f=150,equalizer=f=260:t=q:w=1.0:g=-4,acompressor=threshold=-34dB:ratio=4:attack=120:release=700',
                         # (first try, "Cold draught moaning softly down a long empty stone castle corridor, hollow airy
                         # wind whistle, eerie and gentle...", was rumble under 150 Hz and little else)
                         prompt='Wind whistling softly through gaps in an old stone castle, high hollow breathy whistle rising and falling slowly, continuous for the whole clip, bright and airy, no low rumble, no thunder'),
            'torches': dict(channels=1, fold=1.5, even=0.5, lufs=-30,
                            # a very quiet take whose crackles stand 40 dB over the flame: brought up, the crackles held down
                            filter='highpass=f=260,volume=20dB,alimiter=limit=0.3:attack=2:release=40:level=disabled',
                            prompt='Candles and wall torches burning close by, soft flame flutter with gentle small crackles, steady, close, no wind, no roar'),
            'ghosts': dict(channels=2, fold=2.5, even=0.5, lufs=-31,
                           filter='highpass=f=220',
                           prompt='Faint ghostly whispers and a far-off wordless ethereal choir drifting through a haunted stone hall, eerie, reverberant, quiet sustained ambience, no melody, no drums'),
        },
        shots={
            # The user's own (2026-11-11, from their Downloads): as the first round ends, a door slams
            # somewhere down the hall and witches laugh (LevelSound.afterRound in src/levels/castle.ts).
            'doorslam': dict(peak=-2, filter='highpass=f=40', end=-55, prompt='(supplied by the user: a door slamming)'),
            'witches': dict(peak=-4, filter='highpass=f=80', end=-50, prompt='(supplied by the user: witches laughing)'),
            # The user's own organ note (2026-11-11, from their Downloads): played on every cut, each time
            # at another note of a scale, so the cuts make a tune (src/ambience.ts, note()). About 1 s of
            # sustain and a 2 s fade; its fundamental is low, so only the rumble under it is taken off.
            'organ': dict(peak=-6, filter='highpass=f=45', end=-50, prompt='(supplied by the user: one organ note)'),
            'creak': dict(peak=-10, filter='highpass=f=200,highpass=f=200', end=-40,
                          # (first try, "A heavy old wooden door creaking open slowly far down a stone hallway, long
                          # reverberant groan", was a groan under 600 Hz with no creak in it)
                          prompt='An old heavy wooden door slowly creaking open on rusty iron hinges, long high squeaky creak, echoing far down a stone hallway, no thud, no low rumble'),
            'arrive': dict(peak=-4, filter='highpass=f=250', longest=1.2,
                           prompt='A ghostly magical whoosh rushing past with a shimmering sparkling tail, airy, bright, ethereal'),
            'slash1': dict(peak=-4, filter='highpass=f=200', longest=0.8,
                           prompt='A sword slicing cleanly through wood and canvas, fast sharp swish and crack with a brief metallic ring, short, close, dry'),
            'slash2': dict(peak=-4, filter='highpass=f=200', start=-18, longest=0.8,
                           prompt='(a second take of slash1)'),
            # the knife drawn, as the Kyoto katana has it (tools/swordsounds.py makes it)
            'arm': dict(copy=os.path.join(OUT, 'arm.wav'), prompt='(public/audio/arm.wav, copied)'),
        },
        occasional=['creak'],
        # The sword made live: the user's own take (2026-11-11, "noise when a power up", from their
        # Downloads, kept in level-src/castle/power.mp3), a steady five seconds with no attack of its own,
        # so all of it is the loop. Played at full level, faded in and out quickly with the trigger.
        # (Before it, an ElevenLabs "magical enchantment hum", still in level-src/castle/hum.mp3.)
        hum=dict(source=os.path.join(SRC, 'castle', 'power.mp3'), channels=2, fold=0.6, even=0.5, lufs=-16,
                 filter='highpass=f=60',
                 prompt='(supplied by the user: their own power-up sound)'),
    ),
    # A pale tiled biohazard lab; the tool is a disinfectant sprayer.
    'lab': dict(
        loops={
            'vent': dict(channels=2, fold=2.0, even=0.85, lufs=-27,
                         filter='highpass=f=160,highpass=f=160,equalizer=f=250:t=q:w=1.0:g=-4,treble=g=6:f=3000',     # the take is a hum; the air is lifted
                         prompt='Laboratory ventilation and fume hood extractor fan, steady airy hum with a faint electrical buzz, bright hiss of moving air, no low rumble, no voices'),
            'bubbles': dict(channels=1, fold=1.5, even=0.5, lufs=-31,
                            filter='highpass=f=220',
                            prompt='Liquid bubbling and gurgling steadily in glass laboratory flasks, close, small bright bubbles, continuous, no voices'),
            'geiger': dict(channels=1, fold=0.6, even=0.0, lufs=-28,
                           filter='highpass=f=700',
                           prompt='A Geiger counter ticking irregularly, fairly busy random dry clicks, close, no hum, no voice, no alarm'),
        },
        shots={
            'alarm': dict(peak=-10, filter='highpass=f=200,lowpass=f=4200', end=-40,
                          prompt='A muffled distant industrial warning buzzer sounding two short beeps, heard through a wall'),
            'arrive': dict(peak=-4, filter='highpass=f=180', longest=0.6,
                           prompt='A wet slimy bloop, one gooey bubble pop, short, cartoonish, close'),
            'melt1': dict(peak=-4, filter='highpass=f=400', longest=1.5,
                          prompt='Acid sizzling and fizzing as it dissolves paper, bright hissing fizz with tiny popping bubbles, fading out'),
            'melt2': dict(peak=-4, filter='highpass=f=400', longest=1.5,
                          prompt='(a second take of melt1)'),
            'arm': dict(peak=-4, filter='highpass=f=400', start=-16, longest=0.2,
                        prompt='A plastic spray bottle trigger squeezed once, one short click, close, dry'),
        },
        occasional=['alarm'],
        # Plays for as long as the trigger is held: all of it above 1 kHz, flat, no seam.
        hum=dict(fold=1.2, even=1.0, lufs=-24,
                 # the take is nearly all above 8 kHz: bring up the part under it so it is a hiss and not a whistle
                 filter='highpass=f=1100,equalizer=f=3500:t=q:w=0.8:g=6,treble=g=-4:f=9000',
                 prompt='Continuous aerosol spray hiss, steady pressurised fine mist spraying without stopping, bright high hiss, constant, no start, no stop, no rumble'),
    ),
}


def db(v):
    return 20 * math.log10(max(v, 1e-9))


def rms(samples):
    return math.sqrt(sum(x * x for x in samples) / max(1, len(samples)))


def envelope(samples, hop):
    """Loudness (RMS) of each `hop` samples."""
    return [rms(samples[i:i + hop]) for i in range(0, len(samples) - hop + 1, hop)]


def trim(a, spec):
    """A take cut to the sound itself: from where it begins to where it is over, faded at both ends."""
    if 'window' in spec:
        a = a[int(spec['window'][0] * RATE):int(spec['window'][1] * RATE)]
    hop = RATE // 200
    level = envelope(a, hop)
    top = max(level)
    loud = [i for i, v in enumerate(level) if v > top * 10 ** (spec.get('start', -30) / 20)]
    tail = [i for i, v in enumerate(level) if v > top * 10 ** (spec.get('end', -45) / 20)]
    # a one-shot answers something the player did: it starts right where the sound does
    start = max(0, loud[0] * hop - RATE // 500)
    end = min(len(a), (tail[-1] + 1) * hop + RATE // 25)
    capped = 'longest' in spec and end - start > spec['longest'] * RATE
    if capped:
        end = start + int(spec['longest'] * RATE)
    cut = array.array('f', a[start:end])
    rise = RATE // 500
    fall = min(int((0.18 if capped else 0.08) * RATE), len(cut) // 3)
    for i in range(rise):
        cut[i] *= i / rise
    for i in range(fall):
        cut[len(cut) - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fall)
    return cut


def shot(level, name, spec):
    out = os.path.join(OUT, level, name + '.wav')
    if 'copy' in spec:
        shutil.copyfile(spec['copy'], out)
        print(f'  {name:8s} copied from {os.path.relpath(spec["copy"], OUT)}')
        return True
    source = os.path.join(SRC, level, name + '.mp3')
    if not os.path.exists(source):
        print(f'  {name:8s} no take at {source}, skipped')
        return False
    cut = trim(A.decode(source, 1, spec['filter'])[0], spec)
    gain = 10 ** (spec['peak'] / 20) / max(abs(x) for x in cut)
    A.write_wav(out, [cut], gain)
    print(f'  {name:8s} {len(cut) / RATE:5.2f} s  peak {spec["peak"]:4.0f} dBFS  (gain {db(gain):+5.1f} dB)')
    return True


def loop(level, name, spec, target):
    """One seamless period of a take as a padded MP3. Returns its length in seconds, or None."""
    source = spec.get('source', os.path.join(SRC, level, name + '.mp3'))
    if not os.path.exists(source):
        print(f'  {name:8s} no take at {source}, skipped')
        return None
    channels = A.decode(source, spec.get('channels', 1), spec['filter'])
    if 'window' in spec:
        channels = [ch[int(spec['window'][0] * RATE):int(spec['window'][1] * RATE)] for ch in channels]
    channels = [A.fold(ch, int(spec['fold'] * RATE)) for ch in channels]
    channels = A.even_out(channels, spec['even'])
    n = len(channels[0])
    # measure over two turns of the loop, then set the level, clear of clipping
    probe = os.path.join(OUT, level, target + '.probe.wav')
    A.write_wav(probe, channels, repeat=2)
    lufs, peak = A.loudness(probe)
    os.remove(probe)
    gain_db = min(spec['lufs'] - lufs, -3.0 - peak)
    padded = os.path.join(OUT, level, target + '.padded.wav')
    A.write_wav(padded, channels, 10 ** (gain_db / 20), lead=int(LEAD * RATE))
    A.run('ffmpeg', '-v', 'error', '-y', '-i', padded, '-c:a', 'libmp3lame', '-b:a', '160k' if len(channels) == 2 else '96k',
          os.path.join(OUT, level, target + '.mp3'))
    os.remove(padded)
    print(f'  {name:8s} {n / RATE:6.2f} s  {len(channels)} ch  {lufs:6.1f} -> {lufs + gain_db:6.1f} LUFS  peak {peak + gain_db:5.1f} dBFS')
    return n / RATE


def build(level):
    spec = SETS[level]
    os.makedirs(os.path.join(OUT, level), exist_ok=True)
    print(level)
    made = {'loops': {}, 'shots': [], 'occasional': [], 'hum': None}
    for name, layer in spec['loops'].items():
        seconds = loop(level, name, layer, name)
        if seconds:
            made['loops'][name] = {'seconds': seconds, 'lead': LEAD, 'channels': layer['channels']}
    for name, one in spec['shots'].items():
        if shot(level, name, one):
            made['shots'].append(name)
            if name in spec['occasional']:
                made['occasional'].append(name)
    if spec['hum']:
        seconds = loop(level, 'hum', spec['hum'], 'hum')
        if seconds:
            made['hum'] = {'seconds': seconds, 'lead': LEAD}
    with open(os.path.join(OUT, level, 'set.json'), 'w') as out:
        json.dump(made, out, indent=1)
        out.write('\n')


# ---------------------------------------------------------------- measuring a take (nobody can listen)

BANDS = [('<150', 'lowpass=f=150'), ('150-600', 'highpass=f=150,lowpass=f=600'), ('600-2.5k', 'highpass=f=600,lowpass=f=2500'),
         ('2.5k-8k', 'highpass=f=2500,lowpass=f=8000'), ('>8k', 'highpass=f=8000')]


def measure_file(path):
    """What can be told without ears: length, where the energy is, how steady it is, how many events."""
    a = A.decode(path, 1, 'anull')[0]
    total = rms(a)
    bands = [db(rms(A.decode(path, 1, chain)[0])) - db(total) for _, chain in BANDS]
    hop = RATE // 100
    level = sorted(envelope(a, hop))
    p = lambda q: level[min(len(level) - 1, int(q * len(level)))]
    env = envelope(a, hop)
    top = max(env)
    # the part of the time the sound is "on": within 20 dB of its loudest hundredth of a second
    on = sum(1 for v in env if v > top * 0.1) / len(env)
    # events: rises through 12 dB under the top after at least 60 ms below it
    events, below = 0, 6
    for v in env:
        if v > top * 0.25:
            if below >= 6:
                events += 1
            below = 0
        else:
            below += 1
    first = next(i for i, v in enumerate(env) if v > top * 10 ** (-30 / 20)) * hop / RATE
    edges = db(rms(a[:RATE // 4])) - db(rms(a[-RATE // 4:])) if len(a) > RATE else 0.0
    return dict(seconds=len(a) / RATE, rms=db(total), bands=bands, spread=db(p(0.9)) - db(p(0.1)), on=on, events=events,
                first=first, edges=edges)


def measure(folder):
    print(f'{"take":34s} {"sec":>6s} {"rms":>6s}  ' + ' '.join(f'{name:>8s}' for name, _ in BANDS) + '  p90-p10    on  events  starts  head-tail')
    for root, _, files in sorted(os.walk(folder)):
        for name in sorted(files):
            if not name.endswith(('.mp3', '.wav')):
                continue
            m = measure_file(os.path.join(root, name))
            label = os.path.relpath(os.path.join(root, name), folder)
            print(f'{label:34s} {m["seconds"]:6.2f} {m["rms"]:6.1f}  ' + ' '.join(f'{b:8.1f}' for b in m['bands'])
                  + f'  {m["spread"]:7.1f} {m["on"] * 100:4.0f}%  {m["events"]:6d}  {m["first"]:5.2f}s  {m["edges"]:+8.1f}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--measure':
        measure(args[1] if len(args) > 1 else SRC)
    else:
        for level in (args or SETS):
            build(level)
