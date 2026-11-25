"""Transcribe downloaded TikTok videos and write one Markdown report per account.

Usage: python transcribe.py <work_dir> <output_dir>
For each video: metadata (date, views, likes, description, hashtags),
Whisper transcript of the audio, and OCR of on-screen text from a few frames.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

work, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv"}

def ocr_frames(video: Path) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""
    texts = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", str(video), "-vf", "fps=1/3,scale=720:-1",
             "-frames:v", "12", f"{tmp}/f_%02d.png"],
            check=False,
        )
        for img in sorted(Path(tmp).glob("*.png")):
            t = pytesseract.image_to_string(Image.open(img), lang="fra").strip()
            t = " ".join(t.split())
            if len(t) > 3 and t not in texts:
                texts.append(t)
    return "\n".join(f"- {t}" for t in texts)

accounts = [d for d in work.iterdir() if d.is_dir()] if work.exists() else []
if not accounts:
    (out / "STATUS.md").write_text("Aucune vidéo téléchargée (TikTok a probablement bloqué le téléchargement).\n")
    sys.exit(0)

from faster_whisper import WhisperModel
model = WhisperModel("small", device="cpu", compute_type="int8")

for acc in accounts:
    videos = sorted(p for p in acc.iterdir() if p.suffix.lower() in VIDEO_EXT)
    lines = [f"# @{acc.name} — {len(videos)} vidéos\n"]
    for v in videos:
        info_path = v.with_suffix(".info.json")
        info = json.loads(info_path.read_text()) if info_path.exists() else {}
        segments, _ = model.transcribe(str(v), language="fr", vad_filter=True)
        transcript = " ".join(s.text.strip() for s in segments).strip()
        lines += [
            f"\n## {info.get('upload_date', '?')} — {info.get('id', v.stem)}",
            f"URL: {info.get('webpage_url', '')}",
            f"Vues: {info.get('view_count')} · Likes: {info.get('like_count')} · "
            f"Commentaires: {info.get('comment_count')} · Durée: {info.get('duration')} s",
            f"\n**Description :** {info.get('description') or info.get('title') or ''}",
            f"\n**Transcription :**\n\n{transcript or '(pas de parole)'}",
        ]
        ocr = ocr_frames(v)
        if ocr:
            lines.append(f"\n**Texte à l'écran (OCR) :**\n{ocr}")
        print(f"done {v.name}", flush=True)
    (out / f"{acc.name}.md").write_text("\n".join(lines) + "\n")
    meta = [json.loads(p.read_text()) for p in sorted(acc.glob("*.info.json"))]
    (out / f"{acc.name}_meta.json").write_text(json.dumps(
        [{k: m.get(k) for k in ("id", "upload_date", "description", "view_count", "like_count",
                                 "comment_count", "duration", "webpage_url", "uploader", "channel")}
         for m in meta], ensure_ascii=False, indent=1))
