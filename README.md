# ITC Spirit Scanner

A prototype dual-channel digital spirit scanner inspired by the P-SB11 and Panasonic RR series recorders. The web client targets desktop and mobile browsers, offering sweep control, static beds, VOX capture, and visual telemetry for instrumental transcommunication (ITC) research.

## Features

- **Dual sweep engines** for AM and FM bands with adjustable sweep rates (50–350&nbsp;ms) and forward/reverse scanning.
- **Temperature drift simulation** to emulate crystal oscillator behaviour and affect sweep modulation.
- **Static bed and noise selection** with white and pink noise textures plus gain control.
- **Live station catalogues** with a bundled preset bank and optional Radio Browser lookups so sweeps can lock onto fresh AM/FM
  streams in your region.
- **Visual feedback** including live frequency readouts, waveform oscilloscope, and signal strength meter for each channel.
- **VOX (voice-activated) recording** with adjustable threshold, manual transport, playback speed detune, and session-based capture list.
- **Session snapshots** stored locally with timestamped settings for repeatability and documentation.
- **Responsive interface** tuned for large displays and mobile devices with a vintage-inspired aesthetic.

> ⚠️ The prototype uses the Web Audio API and requires a secure origin (https) for microphone access on most devices. Hardware radio scanning remains simulated—curated internet stations provide the live audio for each sweep lock.

## Current limitations

- **No direct RF hardware control.** Browsers do not expose APIs for tuning physical AM/FM receivers, so the sweep engines still modulate filtered noise when no stream is available. The curated internet station list supplies live content but cannot interrogate the spectrum in real time.
- **Streaming sources, not RF hardware.** The curated presets and Radio Browser integration rely on internet streams. Some stations block regions, and availability can change without notice, so you may still want to maintain your own verified preset list.
- **Microphone/line-in capture still required.** The VOX recorder uses the browser's `MediaRecorder` API. To log real radio responses you must supply audio via the system input that the browser can access once permissions are granted.

These constraints mean the experience replicates the cadence and ambience of a P-SB11, but it still cannot directly drive hardware receivers without additional native tooling.

## Getting started

1. Serve the project locally (any static file server works). For example:
   ```bash
   python -m http.server 5173
   ```
2. Open `http://localhost:5173` in a modern Chromium, Firefox, or WebKit-based browser.
3. Interact with the interface to grant audio context activation. Enable the VOX feature to request microphone access when ready to record.

## Station sources

- **Curated presets** – Selected global AM/FM streams that cover talk, news, and music formats. Use this mode if you are offline or want predictable behaviour.
- **Radio Browser API** – Query the open Radio Browser catalogue by keyword and optional country code. The scanner filters results for playable AM/FM-style streams and immediately refreshes both channels with the returned stations.
- Switch between sources from the **Station Source** panel inside the interface. When Radio Browser lookups fail or return no playable streams the app automatically falls back to the curated bank so sweeps remain active.

## Roadmap ideas

- Native wrappers (Electron / Capacitor) for desktop and Android distribution.
- Expanded frequency banks with custom station presets and investigator tagging.
- Cloud-backed session sync and waveform export.
- Enhanced spectral analysis with waterfall plots and anomaly markers.
