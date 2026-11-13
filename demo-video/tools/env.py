import subprocess, sys, struct, math
def env(path, rate=100, lp=None):
    af = f"{'lowpass=f=%d,' % lp if lp else ''}aresample=8000"
    raw = subprocess.run(['ffmpeg','-v','error','-i',path,'-af',af,'-ac','1','-f','s16le','-'],capture_output=True).stdout
    s = struct.unpack('<%dh' % (len(raw)//2), raw); hop = 8000//rate
    return [math.sqrt(sum(x*x for x in s[i:i+hop])/hop)/32768 for i in range(0, len(s)-hop, hop)]
if __name__ == '__main__':
    e = env(sys.argv[1], 2)
    print(' '.join(f'{20*math.log10(x+1e-6):.0f}' for x in e))
