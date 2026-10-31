# Shellraiser — TMNT × Halloween audio visualizer

A real-time, browser-based audio visualizer built for a Halloween party: four
mask-coloured turtle brothers, a glowing sewer, a haunted skyline with lightning
on the beat, and a swirling mutagen vortex. It listens to the room through the
laptop's microphone and is designed to be projected on a wall.

Built with Vite + TypeScript + Canvas 2D. No backend, no accounts, no install
beyond Node.

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL (normally <http://localhost:5173>) in Chrome or Safari,
click **Start with microphone / line-in**, allow the microphone, and press
**F** for fullscreen.

Production build (static files in `dist/`, open them from any static server):

```bash
npm run build
npm run preview   # serves dist/ locally for a final check
```

## Controls

| Input | Action |
| --- | --- |
| `1` `2` `3` `4` or scene buttons | Switch scene: Turtles · Sewer · City · Ooze |
| `Space` / `→` / `←` | Next / previous scene |
| `F` or Fullscreen button | Toggle fullscreen |
| `H` | Hide / show the control panel (`Esc` shows it again) |
| Mouse idle 3 s | Panel and cursor auto-hide; move the mouse to bring them back |
| Sensitivity slider | Manual gain on top of the automatic normalisation |
| Audio source | Microphone / line-in (default), audio file, or built-in demo beat |
| Input device | Any microphone or line-in the OS exposes; the built-in mic is picked by default |

URL parameters for kiosk use: `?scene=3` opens on a scene, `?source=demo`
auto-starts the demo beat where the browser allows audio without a click.

## How the audio works

- **Microphone first.** On Start the app requests the laptop's built-in
  microphone with `echoCancellation`, `noiseSuppression` and `autoGainControl`
  all **disabled**, so the browser's voice-call processing doesn't treat the
  music as background noise and squash it. The device picker lets you override
  the choice (e.g. a USB interface or line-in).
- **Automatic gain.** A rolling peak tracker (fast attack, ~4 s release)
  normalises the signal so visuals look full whether the room is quiet or loud;
  the Sensitivity slider multiplies on top of that. A slow noise-floor tracker
  keeps HVAC hum from counting as signal.
- **Smoothed FFT.** 2048-point FFT, analyser smoothing plus asymmetric
  attack/release per bin and a high-frequency tilt so hats and vocals register,
  not just the kick.
- **Beat detection.** Energy-based onset detection on the 35–160 Hz band with
  an adaptive threshold (mean × factor, where the factor adapts to the variance
  of the last ~1.2 s). Detected intervals feed a simple BPM estimator; when
  confidence is high the pulse is predicted between detections so flashes stay
  steady through breakdowns or crowd noise. The current BPM shows next to the
  FPS counter.
- **Fallbacks.** Local audio file playback (`<audio>` → analyser → speakers),
  and a synthetic demo beat built from oscillators and noise for soundchecks
  when there is no music yet.

## Projecting from a MacBook on macOS

1. Connect the projector to the MacBook's **USB-C (USB 3 / DisplayPort)**
   port using a USB-C → HDMI adapter or cable. On the MacBook Neo only the USB 3
   port carries video; the USB 2 port does not.
2. Open **System Settings ▸ Displays**. The projector should appear next to
   the built-in display.
3. Choose **Extend** (the default when the second display is used as a
   separate desktop) rather than **Mirror**: with Extend the projector gets a
   full 16:9 1920×1080 picture while you keep the controls on the laptop
   screen. If the projector shows "Mirror" selected in the *Use as* menu,
   change it to *Extended display*.
4. Select the projector in the Displays list and set its resolution to
   **1920 × 1080** (choose *Show all resolutions* if needed). The app
   itself scales to any window size, but a native 1080p signal avoids the
   projector rescaling it.
5. Drag the browser window onto the projector display, then press **F** (or
   click Fullscreen). Safari may ask you to allow fullscreen once.
6. Move the mouse back to the laptop screen; the controls fade out on the
   projector after 3 s of inactivity.

Tips for the party:

- Give Chrome/Safari microphone permission once; the choice is remembered for
  `localhost`. If the prompt was dismissed, click the lock icon in the address
  bar (Chrome) or *Safari ▸ Settings for This Website* and allow the mic.
- Turn **System Settings ▸ Sound ▸ Input** to the built-in microphone with a
  mid-level input volume. The app's auto-gain handles the rest.
- Set **System Settings ▸ Lock Screen** to never turn the display off while
  the visualizer runs, and disable *Dim display on battery*.
- The projector image is washed out by room light; the scenes are built with
  a near-black background and large, saturated elements for exactly that
  reason, but dim the lights if you can.

## Project layout

```
index.html              Start gate + control panel markup
src/main.ts             Boot: audio engine, renderer, controls, URL params
src/renderer.ts         rAF loop, DPR-aware canvas sizing, scene switching
src/audio/engine.ts     AudioContext, mic/file/demo inputs, FFT, auto-gain
src/audio/beat.ts       Onset detection + BPM estimate
src/audio/demo-synth.ts Procedural demo beat
src/scenes/*.ts         The four scenes + shared procedural shapes/palette
src/ui/controls.ts      Buttons, keyboard, device picker, auto-hide, toasts
```

All turtle, pumpkin, bat and skyline art is drawn procedurally in code; no
third-party artwork, logos or fonts are embedded. The display font is
Creepster (Google Fonts, SIL OFL), loaded from Google Fonts with Impact /
system fallbacks when offline.
