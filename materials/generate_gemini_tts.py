import base64, json, os, subprocess, urllib.request, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = "gemini-3.1-flash-tts-preview"
VOICE = "Kore"

def extract_audio(value, chunks):
    if isinstance(value, dict):
        if isinstance(value.get("data"), str) and (value.get("type") == "audio" or "audio" in value.get("mime_type", "")):
            chunks.append(value["data"])
        else:
            for item in value.values(): extract_audio(item, chunks)
    elif isinstance(value, list):
        for item in value: extract_audio(item, chunks)

def make_wav(pcm, path):
    silence = b"\0" * (24000 * 2)  # one second, mono 24 kHz, 16-bit PCM
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(24000)
        out.writeframes(silence + pcm)

def main():
    key = os.environ.get("GEMINI_API_KEY")
    if not key: raise SystemExit("GEMINI_API_KEY is not set")
    days = json.loads((ROOT / "content.json").read_text())
    for item in days:
        day = item["day"]
        text = item["listening"]["text"]
        prompt = ("Read the following text exactly, with no introduction or additions. "
                  "Sound like a real colleague leaving a friendly, professional voice message "
                  "in natural American English. Use natural connected speech, varied intonation "
                  "and brief meaningful pauses. Speak at a relaxed conversational pace, about "
                  "150 words per minute. Avoid robotic rhythm, exaggerated acting, and over-enunciation.\n\n" + text)
        body = {"model": MODEL, "input": prompt, "response_format": {"type": "audio"},
                "generation_config": {"speech_config": [{"voice": VOICE}]}}
        req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions",
            data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.load(response)
        chunks = []; extract_audio(result, chunks)
        if not chunks: raise RuntimeError(f"No audio returned for Day {day:02d}")
        pcm = b"".join(base64.b64decode(chunk) for chunk in chunks)
        wav = ROOT / "audio" / f"day{day:02d}-gemini.wav"
        mp3 = ROOT / "audio" / f"day{day:02d}.mp3"
        make_wav(pcm, wav)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "3", str(mp3)], check=True)
        wav.unlink()
        print(f"Day {day:02d}: {len(pcm) / 48000 + 1:.1f}s", flush=True)

if __name__ == "__main__": main()
