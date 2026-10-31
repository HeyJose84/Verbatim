# Auto Subtitles Generator (After Effects CEP Extension)

An automated Adobe After Effects extension panel that generates synchronized, animated TikTok/Reels subtitles directly from audio files or existing composition audio with one click — featuring full **Batch Processing** support.

## Features & Version Updates (v1.3.0)

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
  - You can now set normal keyframes on the `[CTRL] Subtitles` null layer to smoothly animate:
    - **Box Color** (animate fill color shifts over time)
    - **Box Opacity**
    - **Font Size**
    - **Text Color**
    - **Word Spacing**
    - **Vertical Position Y**
    - **Box Roundness & Padding**
    - **Drop Shadow** (Color, Opacity, Distance, Softness)
- **Settings Persistence & Project Inheritance**:
  - Automatically preserves your customized styles (colors, font family/variation, sizes, shadows, padding) in local storage.
  - Detects existing subtitle controller settings from the active project so you don't have to reconfigure them every time.
- **Distinct Controller Identification**:
  - Properly names the controller null: `[CTRL] Subtitles - <CompName>`.
  - Color-tagged with vibrant Cyan (label 13) for instant recognition in complex timelines.
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
