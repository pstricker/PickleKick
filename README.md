# PickleKick 🥒⚽

A silly first-person free-kick game. Can you score on the big dill?

**Play it:** https://philstricker.com/PickleKick/

## How to play

1. **Aim** – slide the target where you want the ball to go, then tap to lock it.
2. **Spin** – tap the side of the ball to make the shot curve. The rainbow line shows the path.
3. **Power** – tap to stop the meter. Green is perfect, red goes wild.

Score 3 out of 5 to beat each level. The pickle gets quicker, and from level 3 a wall of
gherkins shows up.

## Run it on your own computer

There is no build step. Serve the folder and open it in a browser:

```bash
python3 -m http.server 5173
```

Then visit http://localhost:5173. An internet connection is needed because Three.js and
the font load from a CDN.

## Tests

```bash
node --test
```

## Layout

- `index.html`, `css/style.css` – page and UI styling
- `js/main.js` – game loop and game states
- `js/physics.js` – ball flight, spin and collisions (no browser code, unit tested)
- `js/levels.js` – level difficulty and scoring
- `js/pickle.js`, `js/wall.js`, `js/ball.js`, `js/scene.js` – the 3D characters and stadium
- `js/memeskin.js`, `assets/pickle-meme.png` – the goalie's photo skin. Replace the image with another
  pickle on a white background to change how the goalie looks.
- `js/controls.js`, `js/hud.js`, `js/effects.js`, `js/audio.js` – input, HUD, confetti and sounds
