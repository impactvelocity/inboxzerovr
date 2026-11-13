"""Video-game voice: the dry take on top, a little room reverb and a faint robot layer under it.

Writes work/audio/vo-fx.wav from work/audio/vo.wav (stems kept: vo-room.wav, vo-robot.wav).
Each layer is set by measurement relative to the dry voice, so the knobs are in dB below it.
"""
import os, re, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); A = os.path.join(ROOT, 'work', 'audio')
SR = 44100
ROOM_DB = -17.0       # reverb wet, below the dry voice (v3 was -13: "a bit less")
ROOM_SECONDS = 1.3    # tail length (a mid-size hall)
ROBOT_DB = -21.0      # robot layer, below the dry voice (v3 was -14: "reduce")
GRAIN_DB = -20.0      # grain: a bit-crushed, high-passed copy for a little digital texture
RING_HZ = 55          # ring-mod carrier: low, so it reads as a metallic buzz, not a different pitch
COMB_MS = (6, 9.5)    # short comb echoes for the hollow, helmet-ish colour

def run(*a): return subprocess.run(a, check=True, capture_output=True, text=True)
def w(n): return os.path.join(A, n)
def lufs(path):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])

# an impulse response: two decorrelated pink-noise bursts with an exponential fade, darkened, 18 ms pre-delay
run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'anoisesrc=d={ROOM_SECONDS}:c=pink:r={SR}:seed=7', '-f', 'lavfi', '-i', f'anoisesrc=d={ROOM_SECONDS}:c=pink:r={SR}:seed=11',
    '-filter_complex', f'[0][1]join=inputs=2:channel_layout=stereo,afade=t=out:st=0:d={ROOM_SECONDS}:curve=exp,lowpass=f=5200,highpass=f=220,adelay=18|18',
    w('ir.wav'))
# the room: the voice through it, wet only
run('ffmpeg', '-y', '-i', w('vo.wav'), '-i', w('ir.wav'), '-filter_complex',
    '[0]aformat=channel_layouts=stereo[v];[v][1]afir=irnorm=-1,apad=pad_dur=1.5', w('vo-room-raw.wav'))
# the robot: ring-modulated copy through short combs, kept to the mids
c1, c2 = COMB_MS
run('ffmpeg', '-y', '-i', w('vo.wav'), '-f', 'lavfi', '-i', f'sine=f={RING_HZ}:r={SR}', '-filter_complex',
    f'[0]aformat=channel_layouts=mono[v];[1]aformat=channel_layouts=mono[c];[v][c]amultiply,'
    f'aecho=in_gain=0.8:out_gain=0.9:delays={c1}|{c2}:decays=0.6|0.5,highpass=f=350,lowpass=f=4500,'
    f'aformat=channel_layouts=stereo,apad=pad_dur=1.5', '-shortest', w('vo-robot-raw.wav'))
# the grain: a bit-crushed copy, only its top end, so it reads as texture rather than distortion
run('ffmpeg', '-y', '-i', w('vo.wav'), '-af', 'acrusher=bits=6:mode=log:aa=0.4:samples=3:mix=1,highpass=f=2200,aformat=channel_layouts=stereo,apad=pad_dur=1.5', w('vo-grain-raw.wav'))
dry = lufs(w('vo.wav'))
grain_gain = GRAIN_DB - (lufs(w('vo-grain-raw.wav')) - dry)
run('ffmpeg', '-y', '-i', w('vo-grain-raw.wav'), '-af', f'volume={grain_gain:.2f}dB', w('vo-grain.wav'))
room_gain = ROOM_DB - (lufs(w('vo-room-raw.wav')) - dry)
robot_gain = ROBOT_DB - (lufs(w('vo-robot-raw.wav')) - dry)
run('ffmpeg', '-y', '-i', w('vo-room-raw.wav'), '-af', f'volume={room_gain:.2f}dB', w('vo-room.wav'))
run('ffmpeg', '-y', '-i', w('vo-robot-raw.wav'), '-af', f'volume={robot_gain:.2f}dB', w('vo-robot.wav'))
run('ffmpeg', '-y', '-i', w('vo.wav'), '-i', w('vo-room.wav'), '-i', w('vo-robot.wav'), '-i', w('vo-grain.wav'), '-filter_complex',
    '[0]aformat=channel_layouts=stereo,apad=pad_dur=1.5[d];[d][1][2][3]amix=inputs=4:normalize=0:duration=first', w('vo-fx.wav'))
print(f'dry {dry:.1f} LUFS; room {lufs(w("vo-room.wav")):.1f}; robot {lufs(w("vo-robot.wav")):.1f}; grain {lufs(w("vo-grain.wav")):.1f}; together {lufs(w("vo-fx.wav")):.1f}')
