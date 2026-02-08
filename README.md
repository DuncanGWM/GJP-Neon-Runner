# GJP Neon Runner

GJP Neon Runner is a polished, neon-themed endless runner built with **vanilla HTML/CSS/JavaScript** and rendered with **Canvas**.

## Features

- Endless side-scrolling gameplay with increasing speed/difficulty
- Procedural obstacle spawning
- Collectible glowing **GJP tokens** for bonus points
- Start menu, pause menu, and game over screen
- Local high-score persistence via `localStorage`
- Parallax neon city skyline (3 layers)
- Scroll-by neon **GJP sign** (`assets/gjp-sign.svg`)
- Fixed timestep game loop with delta-time accumulator
- Object pooling for obstacles and collectibles
- Keyboard + mobile controls (tap and swipe)
- Web Audio API oscillator SFX (jump, hit, coin) + mute toggle
- Debug overlay toggle (FPS, speed, active object count)

## Run locally

> No bundlers or external dependencies are required.

1. Open a terminal in this repository:
   ```bash
   cd /workspace/GJP-Neon-Runner
   ```
2. Start a local HTTP server:
   ```bash
   python -m http.server 8000
   ```
3. Open the game in your browser:
   ```
   http://localhost:8000
   ```

## Controls

### Keyboard
- **Jump**: `Space` / `ArrowUp` / `W`
- **Slide**: `ArrowDown` / `S`
- **Pause/Resume**: `P`
- **Restart**: `R`
- **Mute toggle**: on-screen **Sound** button
- **Debug overlay**: on-screen **Debug** button

### Mobile
- **Tap** canvas to jump
- **Swipe down** to slide

## Scoring

- Score increases continuously with distance traveled.
- Each collected GJP token gives a large bonus.
- Colliding with an obstacle ends the run.
- Best score is stored locally in browser storage.

## Assets

- `assets/gjp-sign.svg` — neon skyline sign

## Audio implementation

- Sound effects are generated at runtime with the **Web Audio API** using oscillator tones.
- No `.wav` files are required in the repository.
- Audio may remain muted until a user interaction occurs (browser autoplay policy).

## Troubleshooting

- **Blank page or 404 assets:** make sure you are serving with `python -m http.server` from repo root and not opening `index.html` via `file://`.
- **No sound on first click:** some browsers block audio until user interaction. Press **Start Run** or jump once to unlock audio.
- **Port already in use:** run a different port, e.g. `python -m http.server 9000`, then open `http://localhost:9000`.
- **Mobile gestures not working smoothly:** ensure the touch begins and ends over the canvas area.
