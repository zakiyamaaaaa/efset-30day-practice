import json, subprocess
from pathlib import Path
p=Path(__file__).resolve().parent
days=json.loads((p/'content.json').read_text())
for d in days:
    n=d['day']; voice=['Samantha','Daniel','Karen'][(n-1)%3]
    rate=150 if n<=7 else 160 if n<=14 else 170
    output=p/'audio'/f'day{n:02d}.aiff'
    subprocess.run(['say','-v',voice,'-r',str(rate),'-f',str(p/'scripts'/f'day{n:02d}.txt'),'-o',str(output)],check=True)
    if output.stat().st_size<10000:
        raise RuntimeError(f'No audio generated for day {n}')
    print(f'Day {n:02d}: {voice}, {rate} wpm',flush=True)
