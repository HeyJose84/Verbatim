import argparse
import json
import os
import sys

def transcribe_and_chunk(audio_path, output_json, language="es", max_words=3, max_duration=1.6, model_size="small"):
    print(f"[STATUS] Initializing speech engine with model '{model_size}'...", flush=True)
    
    if not os.path.exists(audio_path):
        print(f"[ERROR] Audio file not found: {audio_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        print(f"[ERROR] faster-whisper library is not installed: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
    except Exception as e:
        print(f"[ERROR] Failed to load Whisper model: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    print(f"[STATUS] Transcribing audio '{os.path.basename(audio_path)}'...", flush=True)
    
    lang_param = None if (not language or language.lower() in ("auto", "none")) else language.lower()

    try:
        segments, info = model.transcribe(
            audio_path,
            language=lang_param,
            word_timestamps=True,
            vad_filter=True
        )
    except Exception as e:
        print(f"[ERROR] Transcription failed: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    detected_lang = info.language
    lang_prob = info.language_probability
    total_audio_dur = info.duration
    print(f"[STATUS] Detected language: {detected_lang} (confidence: {lang_prob:.2f})", flush=True)

    all_words = []
    all_segments = []

    for segment in segments:
        seg_dict = {
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
            "words": []
        }
        for word in segment.words:
            w_dict = {
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(word.probability, 3)
            }
            if w_dict["word"]:
                seg_dict["words"].append(w_dict)
                all_words.append(w_dict)
        all_segments.append(seg_dict)

    print(f"[STATUS] Total words recognized: {len(all_words)}. Structuring phrase chunks...", flush=True)

    chunks = []
    current_chunk = []

    for w in all_words:
        if not current_chunk:
            current_chunk.append(w)
            continue

        chunk_dur = w["end"] - current_chunk[0]["start"]
        prev_word = current_chunk[-1]["word"]

        # Break conditions: punctuation, max words limit, max duration, or pause gap
        is_punct = prev_word.endswith((".", ",", "!", "?", "...", ":", ";", "¡", "¿"))
        is_length = len(current_chunk) >= max_words
        is_time = chunk_dur >= max_duration
        is_pause = (w["start"] - current_chunk[-1]["end"]) > 0.45

        if is_punct or is_length or is_time or is_pause:
            chunks.append({
                "start": current_chunk[0]["start"],
                "end": current_chunk[-1]["end"],
                "text": " ".join([item["word"] for item in current_chunk]),
                "words": current_chunk
            })
            current_chunk = [w]
        else:
            current_chunk.append(w)

    if current_chunk:
        chunks.append({
            "start": current_chunk[0]["start"],
            "end": current_chunk[-1]["end"],
            "text": " ".join([item["word"] for item in current_chunk]),
            "words": current_chunk
        })

    # Prepare compact chunks ready for After Effects JSX composition building
    compact_chunks = []
    low_confidence_count = 0

    for idx, chunk in enumerate(chunks):
        chunk_dur = max(0.8, round(chunk["end"] - chunk["start"] + 0.3, 3))
        clean_txt = "".join([c for c in chunk["text"] if c.isalnum() or c in (" ", "_", "-")]).strip()[:18]
        comp_title = f"Sub_{idx+1:02d} - {clean_txt}"

        words_data = []
        chunk_probs = []
        for w_i, w in enumerate(chunk["words"]):
            loc_start = max(0.0, round(w["start"] - chunk["start"], 3))
            loc_end = max(loc_start + 0.1, round(w["end"] - chunk["start"], 3))
            prob = float(w.get("probability", 1.0))
            chunk_probs.append(prob)
            words_data.append({
                "name": f"W_{w_i}",
                "text": w["word"],
                "start": loc_start,
                "end": loc_end,
                "probability": round(prob, 3)
            })

        avg_prob = sum(chunk_probs) / max(1, len(chunk_probs))
        min_prob = min(chunk_probs) if chunk_probs else 1.0
        conf_pct = round(avg_prob * 100, 1)
        min_conf_pct = round(min_prob * 100, 1)
        if conf_pct < 75.0 or min_conf_pct < 65.0:
            low_confidence_count += 1

        compact_chunks.append({
            "idx": idx,
            "title": comp_title,
            "text": chunk["text"],
            "start": round(chunk["start"], 3),
            "end": round(chunk["end"], 3),
            "duration": chunk_dur,
            "confidence": conf_pct,
            "min_confidence": min_conf_pct,
            "words": words_data
        })

    result = {
        "success": True,
        "language": detected_lang,
        "language_probability": round(lang_prob, 3),
        "duration": round(total_audio_dur, 3),
        "total_words": len(all_words),
        "total_chunks": len(compact_chunks),
        "low_confidence_chunks": low_confidence_count,
        "chunks": compact_chunks
    }

    os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[STATUS] Subtitle phrasing ready: {len(compact_chunks)} chunks generated.", flush=True)
    print(f"[DONE] Saved to {output_json}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto Subtitles Speech Transcription Engine")
    parser.add_argument("--audio", required=True, help="Input audio file path")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    parser.add_argument("--language", default="es", help="Language code (es, en, auto)")
    parser.add_argument("--max_words", type=int, default=3, help="Max words per chunk")
    parser.add_argument("--max_duration", type=float, default=1.6, help="Max duration per chunk in seconds")
    parser.add_argument("--model", default="small", help="Whisper model size (small, base, tiny)")

    args = parser.parse_args()
    transcribe_and_chunk(
        audio_path=args.audio,
        output_json=args.output,
        language=args.language,
        max_words=args.max_words,
        max_duration=args.max_duration,
        model_size=args.model
    )
