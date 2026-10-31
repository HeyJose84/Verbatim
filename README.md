# Auto Subtitles Generator (After Effects CEP Extension)

An automated Adobe After Effects extension panel that generates synchronized, animated TikTok/Reels subtitles directly from audio files or existing composition audio with one click — featuring full **Batch Processing**, **Interactive Transcription Review**, and **Dynamic Word Re-synchronization**.

## Features & Version Updates (v1.4.0)

- **🔍 Interactive Transcription Review & Approval Modal**:
  - Optional pre-generation review (`[✔] Review & edit transcription before building in AE`).
  - View all phrase chunks before anything is written to the After Effects timeline.
  - Quick inline phrase text editing and phrase merging (`Merge with Next`).
- **🎯 Dynamic Word Re-synchronization (Fix Split Words & Word Count Shifts)**:
  - When editing a phrase that splits a word across chunks, or changing a chunk from e.g. 3 words to 2 words, the engine calculates proportional, character-weighted durations:
    $$\text{wordDuration}_i = \text{totalDuration} \times \frac{\text{length}(\text{word}_i)}{\sum \text{length}}$$
  - Automatically preserves highlight box alignment, pop animations, and word-by-word timing without breaking After Effects precomps.
- **📊 Transcription Confidence Index & Badges**:
  - Each chunk displays an automated confidence indicator calculated from word log-probabilities:
    - 🟢 High Confidence (≥ 80%)
    - 🟡 Medium Confidence (60% – 79%)
    - 🔴 Low Confidence (< 60%)
  - Filter by `⚠️ Low Confidence` to focus only on uncertain words without reviewing the whole script.
- **⚡ Organized Effect Controls Panel Grouping**:
  - Structured visual header banners on the `[CTRL] Subtitles` null:
    - `══ [1] SETUP & TIMING ══` (Vertical Position Y, Word Spacing, Pop Scale Amount)
    - `══ [2] FONT & TEXT ══` (Font Size, Text Color)
    - `══ [3] HIGHLIGHT BOX ══` (Box Color, Box Opacity, Box Roundness, Padding X/Y)
    - `══ [4] DROP SHADOW ══` (Shadow Color, Opacity, Distance, Softness)
- **⚡ Batch Composition Processing**:
  - Select multiple compositions in your project simultaneously via a checklist.
  - "Select All" / "Deselect All" one-click toggles.
  - Automatically mixes, transcribes, and constructs isolated animated subtitle hierarchies for every selected composition in sequence.
  - Real-time batch progress tracking with composition index, percentage, and chunk counter.
- **Multi-Composition Project Isolation**:
  - Run the plugin across multiple compositions in the same After Effects project without conflicts.
  - Subtitle comps and chunk precomps are placed in isolated subfolders: `01_SUBTITLES / [Subtitles] <CompName> / Chunks`.
  - Re-generating subtitles for one composition never modifies, overwrites, or deletes subtitles from any other composition.
- **Keyframe-Animatable Style Controllers**:
  - Solves the nested precomp time-drift issue by resolving global timeline time $\text{globalTime} = \text{time} + \text{chunkComp.startTime} + \text{subComp.startTime}$.
  - You can set normal keyframes on the `[CTRL] Subtitles` null layer to smoothly animate Box Color, Opacity, Font Size, Text Color, etc.
- **Settings Persistence & Project Inheritance**:
  - Automatically preserves your customized styles in local storage.
  - Detects existing subtitle controller settings from the active project.
- **Distinct Controller Identification**:
  - Controller null named `[CTRL] Subtitles - <CompName>` with Cyan color tag (label 13).
  - Reference text layer named `[REF] Subtitle Style - <CompName>` with Green color tag (label 9).
- **Installed Fonts & Variations**:
  - Live dropdown of installed system fonts with variations (e.g., *Sharp Grotesk* Bold 16, SemiBold 16, Book 19).
  - One-click `🔄 Apply Font to Active Subtitles` updates only the active composition's subtitles.
- **Offline Speech Recognition**:
  - Powered by OpenAI Whisper (`faster-whisper`), running locally with INT8 quantization on CPU.
- **100% Non-Destructive**: Every generation is wrapped in an After Effects undo group (`Ctrl+Z`).

## Three Workflow Modes

1. **Audio File Mode**: Pick any audio file (`.wav`, `.mp3`, `.m4a`, etc.) and insert it into an existing comp or auto-create a new blank composition (9:16 vertical, 16:9 landscape, or 1:1 square).
2. **Single Comp Audio Mode**: Pick a single composition from the dropdown to transcribe its speech audio and generate subtitles directly inside it.
3. **⚡ Batch Comps Mode**: Check multiple compositions from your project checklist and generate subtitles for all of them automatically in a single batch run.

## Folder Structure

```text
auto-subtitles-plugin/
├── CSXS/
│   └── manifest.xml         # CEP Extension declaration (AEFT 16.0 - 99.9)
├── client/
│   ├── index.html           # Dark-mode panel UI with single & batch modes
│   ├── style.css            # Adobe-native dark theme styling & checklist UI
│   ├── app.js               # Panel controller, batch pipeline & settings persistence
│   └── csinterface.js       # Adobe CEP interface bridge
├── jsx/
│   └── host.jsx             # ExtendScript builder, comp isolation & animatable controllers
├── backend/
│   └── transcribe_engine.py # Faster-whisper transcription & phrase chunking CLI
├── install.ps1              # One-click installer & registry configurator
└── README.md                # Documentation
```

## Installation / Update

1. The plugin is linked directly to your Adobe CEP directory:
   `%APPDATA%\Adobe\CEP\extensions\com.brandstales.autosubtitles`
2. Open After Effects and access via **Window > Extensions > Auto Subtitles Generator**.
