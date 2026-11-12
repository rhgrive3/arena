# Epic Battle Simulator

A Japanese-language 3D tactical battle simulator built with React, Vite, Three.js, Tailwind CSS v4 and Motion.

The original game engine, 43 deployable unit types, six battlefields and 30 campaign missions are preserved. The interface adds an original cinematic title screen, a campaign browser, a searchable 3D armory, a guided deployment workflow, independent army resets, paid-unit refunds, persistent settings and battle reports.

Original source: [rhgrive3/arena, epic-battle-simulator.zip](https://github.com/rhgrive3/arena/blob/ccr-8f471149-epo70v/epic-battle-simulator.zip).

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run build
npx tsc --noEmit
npx tsx --test tests/simulation.test.ts tests/units.test.ts tests/rendering.test.ts tests/refinements.test.ts tests/effects.test.ts tests/rules.test.ts tests/outland.test.ts tests/deployment-ui.test.ts
npx playwright install --with-deps chromium
npx playwright test
```

The exhaustive campaign balance suite is available separately in `tests/balance.test.ts` and may take several minutes.

## Project Structure

- `src/App.tsx`: title screen, campaign selection, armory, settings and field manual.
- `src/components/GameScreen.tsx`: deployment, combat, pause and results UI.
- `src/components/UnitPortrait.tsx`: portraits and an interactive viewer of the actual game models.
- `src/game/`: original combat, rendering, campaign, terrain and procedural audio systems.
- `src/index.css`: responsive visual system and reduced-motion support.
- `tests/ui.spec.ts`: browser-level interaction and responsive checks.

3D gameplay requires WebGL 2. Game progress and settings are stored locally in the browser. Audio is off by default and can be enabled from the header or settings.