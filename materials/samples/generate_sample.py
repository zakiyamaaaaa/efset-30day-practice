import os,json,urllib.request,urllib.error,base64,wave,re
from pathlib import Path
p=Path(__file__).resolve().parent
text=json.loads((p.parent/'content.json').read_text())[0]['listening']['text']
prompt='Read the following text exactly, with no introduction or additions. Sound like a real colleague leaving a friendly, professional voice message in natural American English. Use natural connected speech, varied intonation and brief meaningful pauses. Speak at a relaxed conversational pace, about 150 words per minute. Avoid robotic rhythm, exaggerated acting, and over-enunciation.\n\n'+text
body={'model':'gemini-3.1-flash-tts-preview','input':prompt,'response_format':{'type':'audio'},'generation_config':{'speech_config':[{'voice':'Kore'}]}}
req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/interactions',data=json.dumps(body).encode(),headers={'x-goog-api-key':os.environ['GEMINI_API_KEY'],'Content-Type':'application/json'})
try:
 with urllib.request.urlopen(req,timeout=120) as r: result=json.load(r)
except urllib.error.HTTPError as e:
 error=e.read().decode().replace(os.environ['GEMINI_API_KEY'],'[REDACTED]')
 print('HTTP',e.code,error[:1800]);raise SystemExit(1)
chunks=[]
def walk(x):
 if isinstance(x,dict):
  if isinstance(x.get('data'),str) and (x.get('type')=='audio' or 'audio' in x.get('mime_type','')):
   chunks.append(x)
  else:
   for v in x.values():walk(v)
 elif isinstance(x,list):
  for v in x:walk(v)
walk(result)
if not chunks:
 print('No audio. Response keys:',list(result));(p/'response-debug.json').write_text(json.dumps(result));raise SystemExit(2)
pcm=b''.join(base64.b64decode(x['data']) for x in chunks)
with wave.open(str(p/'day01-gemini-kore.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000);w.writeframes(pcm)
meta={'model':body['model'],'voice':'Kore','text':text,'instructions':prompt,'usage':result.get('usage',result.get('usage_metadata')),'audio_metadata':[{k:v for k,v in x.items() if k!='data'} for x in chunks],'seconds':len(pcm)/48000}
(p/'day01-gemini-kore.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
print(json.dumps({'seconds':meta['seconds'],'usage':meta['usage'],'audio_metadata':meta['audio_metadata']}))
