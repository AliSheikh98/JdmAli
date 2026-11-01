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
| `1` `2` `3` `4` `5` or scene buttons | Switch scene: Turtles · Sewer · City · Ooze · Redrum |
| (automatic) | Scenes advance every 40 s. Fights and the bow start on their own |
| `Space` / `→` / `←` | Next / previous scene |
| `F` or Fullscreen button | Toggle fullscreen |
| `H` | Hide / show the control panel (`Esc` shows it again) |
| `X` | Start a fight now (fights also start by themselves) |
| `G` | Toggle automatic fights |
| `S` | Master Splinter enters; turtles and enemies bow |
| Fights slider | How often automatic fights start, from 45 s to 90 s. A long loud stretch can start one sooner |
| Render scale | Backing-store size: 0.5×, 1×, 1.5× or 2× the window, times the display's device pixel ratio |
| Force 1920×1080 | Lock the canvas bitmap at 1920×1080 (useful when a cast client reports a blurry size) |
| Mouse idle 3 s | Panel and cursor auto-hide; move the mouse to bring them back |
| Sensitivity slider | Manual gain on top of the automatic normalisation |
| Audio source | Microphone / line-in (default), audio file, or built-in demo beat |
| Input device | Any microphone or line-in the OS exposes; the built-in mic is picked by default |

URL parameters for kiosk use: `?scene=3` opens on a scene, `?source=demo`
auto-starts the demo beat where the browser allows audio without a click,
`?scale=1.5` sets the render scale, and `?force1080=1` (also `?hd=1`) locks
the backing store at 1920×1080.

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

## Projector tips

- On the Mac, open **System Settings ▸ Displays**, select the projector, then
  **Option-click** **Scaled** (hold the Option key while clicking Scaled) so
  macOS shows the full resolution list. Pick **1920 × 1080**. A native 1080p
  frame stays sharp; a "looks like" scaled mode is what the app then has to
  fight.
- Wireless casting (AirPlay and the usual receiver apps) compresses the
  picture and adds latency. Edges go soft and the beat lands late. In the
  panel set **Render scale** to **1×** or **2×**, and turn on **Force
  1920×1080 backing** if the cast client reports a small or odd resolution.
  The canvas backing store is the window size times the display pixel ratio
  times that render scale, and the drawing context is scaled to match, so the
  bitmap itself is sharp before the cast compresses it. Strokes and type are
  drawn thick with dark outlines for the same reason.
- A **USB-C to HDMI cable** into the MacBook's USB 3 / DisplayPort port (not
  the USB 2 port) sends an uncompressed picture and skips the cast delay.
  Prefer the cable when it will reach. Use wireless only when it will not.

## Project layout

```
index.html              Start gate + control panel markup
src/main.ts             Boot: audio engine, renderer, controls, URL params
src/renderer.ts         rAF loop, DPR × render-scale canvas sizing, scene switching
src/audio/engine.ts     AudioContext, mic/file/demo inputs, FFT, auto-gain
src/audio/beat.ts       Onset detection + BPM estimate
src/audio/demo-synth.ts Procedural demo beat
src/scenes/*.ts         The four scenes + shared procedural shapes/palette
src/fx/horror.ts        Vignette, coarse grain, VHS tears, fog, drips, jump-scares
src/fx/brawl.ts         Fight interludes, gore layer, sensei dojo
src/ui/controls.ts      Buttons, keyboard, device picker, auto-hide, toasts
```

All turtle, pumpkin, bat, skyline, ninja, skeleton and sensei art is drawn
procedurally in code; no third-party artwork or logos are embedded. The
display fonts are Creepster and Bangers (Google Fonts, SIL OFL), loaded from
Google Fonts with Impact / system fallbacks when offline. Fight words on
screen are SPLAT, THWACK, POW, WHAM and BONK. The bow is titled SENSEI.
