import base64,json,subprocess,zipfile
from pathlib import Path
p=Path(__file__).resolve().parent
data=json.loads((p/'content.json').read_text())
audio=[];durations=[]
for d in data:
    n=d['day']; src=p/'audio'/f'day{n:02d}.aiff'; dst=p/'audio'/f'day{n:02d}.mp3'
    if not dst.exists() or (src.exists() and dst.stat().st_mtime<src.stat().st_mtime):
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(src),'-codec:a','libmp3lame','-b:a','64k',str(dst)],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-of','json',str(dst)]))
    duration=float(probe['format']['duration']);assert 15<duration<65,(n,duration)
    voice='Gemini 3.1 Flash TTS / Kore' if n==1 else ['Samantha','Daniel','Karen'][(n-1)%3]
    durations.append({'day':n,'seconds':round(duration,2),'voice':voice})
    audio.append('data:audio/mpeg;base64,'+base64.b64encode(dst.read_bytes()).decode())
template=(p/'player-template.html').read_text()
output=p.parent/'EF_SET_30日教材.html'
output.write_text(template.replace('__CONTENT__',json.dumps(data,ensure_ascii=False)).replace('__AUDIO__',json.dumps(audio)))
(p/'audio-info.json').write_text(json.dumps(durations,ensure_ascii=False,indent=2))
book=['# EF SET 30日教材 — 本文・問題・解説\n','Reading 48（B1）/ Listening 52（B2）/ 総合50（B1）。2026年9月12日受験。\n','出典：https://cert.efset.org/en/963s1P\n','毎日Listening 5分＋Reading 5分。音声付きHTMLを主教材として使用してください。このファイルは印刷・検索・見直し用です。問題編の後に解答編があります。Listeningの本文は解答編に載せています。\n','全問オリジナル・架空設定。公式問題ではなく、難易度は独自設定。初回は辞書・本文（Listening）・解説を見ずに回答。\n','## 5分の使い方\n','Listening：設問20秒→音声50秒→回答50秒→解説80秒→再聴60秒→音読・メモ40秒。\n','Reading：長文を読む120秒→4問に回答90秒→根拠確認60秒→表現を1つ30秒。\n','## 問題編\n']
for d in data:
    book.extend([f'### Day {d["day"]:02d} — {d["title"]}\n',d['focus']+'\n'])
    for k,label in [('listening','Listening'),('reading','Reading')]:
        book.append(f'#### {label}\n')
        if k=='listening': book.append(f'音声：audio/day{d["day"]:02d}.mp3（HTMLでは再生ボタンを押す）\n')
        else: book.append(d[k]['text']+'\n')
        for i,q in enumerate(d[k]['questions'],1):
            book.append(f'{i}. {q["prompt"]}\n')
            book.extend(f'   - {"ABC"[j]}. {o}\n' for j,o in enumerate(q['options']))
    book.append(f'初回 L：__/{len(d["listening"]["questions"])}、R：__/{len(d["reading"]["questions"])}　メモ：________________\n')
book.append('## 解答・スクリプト編\n')
for d in data:
    book.extend([f'### Day {d["day"]:02d} — {d["title"]}\n','#### Listening script\n',d['listening']['text']+'\n'])
    for k,label in [('listening','Listening'),('reading','Reading')]:
        for i,q in enumerate(d[k]['questions'],1):book.append(f'**{label} Q{i}：{"ABC"[q["answer"]]} — {q["options"][q["answer"]]}**\n\n{q["why"]}\n')
    book.append('今日の表現：'+' / '.join(d['words'])+'\n')
bookpath=p.parent/'EF_SET_30日教材_本文と解説.md';bookpath.write_text('\n'.join(book))
with zipfile.ZipFile(p.parent/'EF_SET_30日教材セット.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in [output,bookpath,p.parent/'はじめに.md']:z.write(f,f.name)
    for f in sorted((p/'audio').glob('*.mp3')):z.write(f,'audio/'+f.name)
total_questions=sum(len(d[k]['questions']) for d in data for k in ('listening','reading'))
print(f'HTML: {output.stat().st_size/1024/1024:.1f} MB; audio {min(x["seconds"] for x in durations):.1f}–{max(x["seconds"] for x in durations):.1f} seconds; {len(data)} days / {total_questions} questions')
