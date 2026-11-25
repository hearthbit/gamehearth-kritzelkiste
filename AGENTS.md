# Instructions for AI agents

This repo is a realtime game for **Gamehearth**, a self-hosted game platform. A TV (or a laptop connected to the TV) shows the field, the phones of the players are controllers. The game rules run on the server and advance the world 20 times per second; the TV and the phones only show what the server sends. Here you build a game together with a person. Read this whole file before you change anything.

## Who you work with

The person probably can't program. They know their game, not the code.

- Talk to the person in the language they write in, and write the whole `README.md` in it. The game speaks the person's language first and English second; for an English-speaking person only English. Deviate only if the person wants it. Everything players read comes in every language of the game: all texts in the game (also the hidden labels for screen readers) and `name`, `description` and every `label` in `manifest.json` (see "Languages"). Code, identifiers, IDs, comments and tests are in English. Labels this file quotes from the example (such as a button group name) change with the language of your game.
- Talk about game rules, not about code. Ask what should happen ("What happens when two players run onto the same spot at the same time?"), not how it is built.
- Settle the rules completely before you build them: player count, what you can press on the phone, what is shown on the TV, how long a round lasts, who wins, what happens in a tie. Also ask about variants people want to set before the match (duration, field size); they become options. Write the rules in everyday language in `README.md` and have them confirmed.
- Work in small steps and show something to try out after each step (`npm run dev`, see below). Say in one sentence what changed and what the person should try.
- Use technical terms only with an explanation. Translate error messages into one sentence about what is wrong and what you do about it.
- If the person is not available right now, decide open points sensibly yourself and write them into `README.md` under "Decided by the agent, please check" (in the README's language) so they can confirm or change them later.
- Before the first release, ask about the license and the name (see "Publishing").

## Layout

| Path | Content |
|---|---|
| `manifest.json` | name, version, languages, cover, player count, roles (TV and controller), license, options and the catalog of the profile (`items`, `stats`, `flags`) |
| `ids.lock` | all profile IDs the game ever had; maintained by `npm run check`, belongs in the repo |
| `src/game.ts` | the game rules (reducer with `tick`), run on the server |
| `src/index.ts` | exports the game as `default` |
| `client/src/main.ts` | connects the UI to the platform and starts the TV or the controller depending on the role |
| `client/src/screen.ts` | the field on the TV, drawn and smoothed with Phaser 4 |
| `client/src/controller.ts` | the controller on the phone: buttons that hold a direction, also by keyboard |
| `client/src/view.ts` | everything the UI decides, without Phaser (texts, colors, blending positions, fitting the field); easy to test |
| `client/src/texts.ts` | every text of the TV and the controller, one block per language |
| `client/public/cover.svg` | the cover of the game (4:3); the build copies `client/public/` into the client folder |
| `test/` | tests for rules and UI logic (Vitest) |
| `dist/client/` | the built UI (created by `npm run build`, do not change by hand) |

The template contains a small example game, **Tag**: one player is the catcher; whoever they touch becomes the catcher. When time is up (option "Duration", default 60 seconds), whoever was the catcher for the shortest time wins. It shows the most important patterns. Replace it completely with the person's game (see "Replacing the example").

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | starts the game locally at http://localhost:5180 with the TV and all phones side by side |
| `npm test` | tests |
| `npm run typecheck` | type check of rules and UI |
| `npm run check` | checks the game like the platform does: manifest, license, matches with random bots tick by tick, leaks, determinism, run and speed in the server sandbox. For realtime games it takes a few minutes depending on player count and round length: start it in the background and read the output; for quick runs in between `npm run check -- --players 2` |
| `npm run pack` | builds the game package `dist/<id>-<version>.zip`, only if `check` reports no errors |

`npm run dev` runs until it is stopped. Start it in the background and read its output: the address is there (usually http://localhost:5180; if the port is taken, for example because `dev` is already running, a different one), and errors from the rules and from the UI show up there as a block of text you can fix directly. If a `dev` is already running for this game, keep using it instead of starting a second one. The person opens the address in the browser: the TV at the top, below it a narrow frame per phone. With "Pause", "One tick" and slow motion you can look at a scene closely; every seat can be a bot that presses at random. When the rules change, `dev` starts a new match with the same seats and bots; when the UI changes, it reloads the frames. Stop `dev` at the end together with its child processes (on Windows, for example `taskkill /T /F` on the process at the port from the output).

With `npm run dev -- --host`, `dev` can be reached on the Wi-Fi: open the TV at `/tv` on a large screen, each phone at `/p1`, `/p2` … That way the game feels real.

### Checking the UI

In `dev` the UI runs as isolated as on the platform: in a sandbox iframe without its own origin, also at the addresses of single seats (`/p1`, `/tv`). Some built-in browsers of AI tools do not load such iframes (for example the browser pane of the Claude app: the frames stay empty, the requests fail with `net::ERR_BLOCKED_BY_CLIENT`). There the UI code does not run at all; a terminal without errors then proves nothing. What helps:

- If you have Playwright or a remote-controlled Chrome, operate the page yourself. With Playwright you reach the first phone with `page.locator(".seat:not(.tv)").nth(0).frameLocator("iframe")` and the TV with `page.locator(".seat.tv").frameLocator("iframe")`. Via the Chrome DevTools protocol the isolated frames are missing from `Page.getFrameTree` because they run in their own process; you reach them with `Target.setAutoAttach({ autoAttach: true, flatten: true, waitForDebuggerOnStart: false })`. The frame of a phone has the controller's buttons (group "D-pad"); the arrow keys work too. Playwright does not belong in the game's `package.json`: install it in a separate folder outside the game (`npm i playwright-core` there) and launch the Chromium that is installed on the machine, or use the remote-controlled Chrome. The box `#state` on the page of `dev` holds the whole state as JSON, for example who is the catcher; in realtime it is only filled while "Whole state" is expanded, so expand it first. The frames side by side are always 360 × 640; also open a single seat (`/p1`) at a small phone size such as 320 × 568. That page keeps the header of `dev` above the frame: make the window taller by the header's height, or measure `.frame`. A `/p1` window next to the page with all seats runs the UI of the same seat twice, as when a player has the game open on two devices; the UI must cope with that, for example by taking over what the state shows and sending only what this device did itself.
- As soon as a browser really loads the frames, errors and `console.log` of the UI show up in the terminal of `dev` with the seat and the place in the source. Read them there.
- What the UI decides (texts, colors, blending positions, fitting the field) belongs in `client/src/view.ts` and is tested in `test/view.test.ts`. The more is there, the less you have to look at in the browser.
- If you could not see the UI yourself, say so explicitly at handover and ask the person to open http://localhost:5180 in their normal browser and tell you what they see. That is the most important test anyway.

## Workflow

1. Settle the rules with the person and write them into `README.md`.
2. Design the state: what does everyone see (`public`), what does only one player see (`players[seat]`), what does nobody see (`secret`)? In party games usually everything is in `public`.
3. Write `src/game.ts`, plus tests in `test/rules.test.ts` for every rule, especially for collisions, edges and the end.
4. `npm test` and `npm run typecheck`.
5. `npm run check` until no more errors come. Read warnings and decide deliberately.
6. Adapt the UI: first `client/src/view.ts` (with tests in `test/view.test.ts`), then `client/src/screen.ts` and `client/src/controller.ts`.
7. `npm run dev`, the person plays it. Work in the feedback, repeat from step 3.

Before every handover to the person, `npm test`, `npm run typecheck` and `npm run check` must pass without errors.

## The most important rules for `src/`

The game rules are a **reducer**: five pure functions in `defineGame` from `@gamehearth/sdk`.

```ts
setup({ players, random, options, profiles })   // start state; players = ["p1", "p2", …]
legalMoves(state, player, { players, options, profiles })  // all inputs this seat may make right now (array, empty = none)
apply(state, action, { player, players, random, options, profiles, profile, now })  // apply an input; changing state directly is allowed
tick(state, dt, { players, random, options, profiles, profile, now })  // advance the world one step, 20 times per second, dt is always 50
result(state)                         // undefined while running; otherwise { winners: ["p2"] }
```

This is how a tick goes: all inputs that arrived since the last tick go through `apply` in the order they arrived; then `tick` computes. After every step the platform asks `result`.

1. **Inputs say what is pressed right now.** On press `{ type: "steer", dir: "left" }`, on release `{ type: "steer", dir: "none" }`. `apply` remembers that in the state, `tick` moves as long as it is pressed. Don't send an input in every tick: the platform accepts at most 30 inputs per second from each phone, and if more than 4 from one seat wait for the next tick, the oldest is dropped. If an input still gets lost (for example when a new round resets all directions), the example sends the held direction again as soon as the snapshot shows something else and nothing is in flight (`needsResend` in `client/src/view.ts`).
2. **Count time in ticks.** Remaining time, cooldowns, countdown in the game: count down in `tick` (like `ticksLeft` in the example). `ctx.now` is the server's clock time and keeps running during a pause; it is no good for game time.
3. **Every match must end**, usually through a time limit. `check` plays with bots that press at random; if a match does not end after 10 minutes of game time, that is an error. A game with rounds of its own that may last longer (for example everyone draws once per round) gets either a way for bots to end a phase early (a move like "pass") or `--max-seconds <n>` in both scripts `check` and `pack` in `package.json`; the longer the limit, the longer `check` runs.
4. **Integers for positions and speed.** The example computes in field units with integer speed. `Math.sin`, `Math.cos`, `Math.exp`, `Math.pow`, `Math.hypot` and similar sometimes compute the last digits differently on the server (QuickJS) than in Node; basic arithmetic and `Math.sqrt` are the same everywhere. The easiest way to compare distances is squared (`dx * dx + dy * dy <= r * r`), like `touching` in the example.
5. **The state stays small.** It is checked, copied and sent to all devices 20 times per second. Better a grid as a text or a list of numbers than thousands of objects. `check` warns if a tick takes too long on the server.
6. **No `Math.random()`, no `Date.now()`, no `new Date()`.** Randomness only via `random` (`random.int(1, 6)`, `random.pick(list)`, `random.shuffle(list)` returns a shuffled copy, `random.weighted(table)` draws an entry by its integer `weight`), time only via `ctx.now` and by counting ticks. Every match must be exactly repeatable from seed and inputs.
7. **The state is plain JSON** with exactly three areas: `public` (everyone sees it, the TV too), `players` (one entry per seat, only this phone sees it), `secret` (nobody sees it). No `Set`, no `Map`, no `Date`, no classes, no `undefined` in arrays.
8. **The TV sees only `public`.** What should appear on the field belongs in `public`. What only one phone should show (for example a secret task) belongs in `players[seat]`.
9. **Inputs give nothing away.** Everything in `legalMoves` goes to this player's phone.
10. **`apply` only gets legal inputs.** Don't check again in it whether an input is allowed; the platform does that with `legalMoves`.
11. **`legalMoves` may be empty for everyone**, for example at the end or during a pause in the game; unlike in turn-based games, the match does not hang then, because `tick` keeps running.
12. **Seats instead of names.** Players are called `p1`, `p2`, …; names exist only in the UI via `players`.
13. **No changing variables outside the functions.** On the server many matches run in the same module.
14. **Only the language itself.** The rules run on the server in QuickJS: no `console`, no `structuredClone`, no `Intl`, no network, no files. You may import only files from this folder and `@gamehearth/sdk`.
15. **`setup` does not need to check the player count.** The platform only starts with a number from `manifest.json`.

### Options

Variants that are set before the match are in `manifest.json` under `options`, like "Duration" in the example: either a choice from fixed values (`"type": "choice"` with `choices`, values are integers or short texts) or yes/no (`"type": "boolean"`), always with `label` and `default`. The host sets them in the lobby. Names consist of letters and digits, for example `fieldSize`.

- The rules read them as `ctx.options` in `setup`, `legalMoves`, `apply` and `tick`, always complete. You give the type to `defineGame` as the third type parameter, like `Options` in `src/game.ts`. The example converts the duration into ticks in `setup`.
- `result` gets no options; what the end needs is in the state (in the example `ticksLeft`).
- The UI gets them with every update as `update.options`.
- `check` plays every value of every option. Findings name the options, the command to replay sets them with `--option duration=30`.
- Tests pass the options to `createMatch` (`options: { duration: 60 }`, see `test/rules.test.ts`); without them `ctx.options` is empty.
- Only ask for an option if the person really wants the variant. If a game needs none, `options` goes out of the manifest and `Options` out of the rules.

### Free inputs (typed text, free positions)

If players type something (a guess, a team name) or pick a free position, the input cannot be listed in `legalMoves`. Put a placeholder in its place: `text({ min: 1, max: 40 })` for a text, `int({ min: 0, max: 99 })` for a whole number, both imported from `@gamehearth/sdk`; that needs `"sdk": "^0.1.7"` in `manifest.json`. Details are in the SDK README under "Free inputs: placeholders".

- `apply` gets the typed value and must cope with every value the placeholder allows: `check` and the bots in `dev` type random texts, with umlauts, emoji and punctuation.
- In the UI, `snapshot.moves` contains the placeholder itself: recognize the move by its `type`; `isPlaceholder` from `@gamehearth/sdk/client` gives you its limits, for example for `maxLength` of an input field.
- Typing needs a real `<input>` element in the HTML, not text drawn on a canvas; only then does the phone show its keyboard. Use a font size of at least 16 px, otherwise the iPhone zooms in. The game frame does not submit forms (a `<form>` never fires `submit`): send on the button's `click` and on Enter (`keydown`, `event.key === "Enter"`, not while `event.isComposing`).
- Who may read a typed text is decided, as always, by where the rules put it: a text that only some players may see goes into their `players[seat]` areas, never into `public`.
- Inputs that must not get lost, such as the points of a stroke, are collected by the UI and sent as one input at most every 50 to 100 ms, one at a time. Make them repeatable (each carries its position, for example the number of the stroke and of its first point, so that `apply` ignores what it already has) and let the UI compare its own copy with the state and send again what is missing. Answers with an error are not enough: during a pause the platform keeps only the last input per seat and answers `{ ok: true }`. Growing data like a drawing is a text or a list in the state that only grows at the end; then the platform sends the devices only the new part.

### Profiles

What should stay beyond a match goes in the player's **profile**: collected items, wins, best scores, unlocks. The platform keeps one profile per account and game; the game has no database of its own. In Tag, everyone who was the catcher for the shortest time gets a win at the end (`wins`, with a leaderboard). Ask the person whether anything should stay beyond a match; if not, the game needs no profile.

- **Catalog in the manifest.** Every ID is in `manifest.json` with a display name: `items` (a count, for example jokers or coins), `stats` (numbers; with `"better": "higher"` or `"lower"` the stat gets a leaderboard on the platform's game page, without `better` it is a counter) and `flags` (`true` or a short text, for example for unlocks or "87 cm"; the platform's game page shows `true` as "yes" ("ja") and a text as it is). Names of lowercase letters, digits and `-`.
- **IDs are forever.** `npm run check` enters every ID in `ids.lock`; the file belongs in the repo. Never rename or delete a published ID, but leave it with `"deprecated": true`, otherwise all players lose what they collected. Only IDs that were never published (for example those of the example) may be deleted from `ids.lock` by hand.
- **Reading:** `ctx.profiles[seat]` in `setup`, `legalMoves`, `apply` and `tick`, for example `ctx.profiles[player]?.items.joker ?? 0`. Empty entries are missing.
- **`legalMoves` only offers what the profile allows.** A move that uses up a joker is only in the list if there is one. `check` reports it as an error if that is missing.
- **Writing:** `ctx.profile.add(seat, item, n)`, `stat(seat, name, n)` (change a counter, also for wins), `record(seat, name, value)` (best score: the platform keeps the better one, only for stats with `better`) and `flag(seat, name, value)` (`false` deletes) in `apply` and `tick`; `use(seat, item, n)` (use up) only in `apply`, because a tick cannot be rejected. Every real change in `tick` costs the server a write transaction: write wins and counters once at the end of the match, not in every tick.
- If an item is gone in the meantime because another match of the same player used it up, the platform rejects the move, and nothing changes. The game does not have to do anything for this.
- Guests have an empty profile that expires after the match; the game does not need to know about guests.
- **Types:** `import manifest from "../manifest.json"` and `CatalogOf<typeof manifest>` as the fourth type parameter of `defineGame` (like `Ids` in `src/game.ts`). Then a typo in an ID is a type error.
- **Tests:** `createMatch` and `stepMatch` get `catalog: manifest` and the profiles per seat; the changes of a step are in `outcome.changes`. Example in `test/rules.test.ts`.
- **UI:** it gets its own profile with every update as `update.profile`, never that of the other players. You give the type to `connect` as the fourth type parameter.
- **In `dev`** every seat has a collapsible profile at the bottom that you can edit, for example to give a seat ten wins. It is stored in `.gamehearth/dev-profiles.json` (listed in `.gitignore`) and stays across matches and restarts; if you change the file directly, start a new match afterwards. "Guest" at a seat lets it play with an empty profile that expires after the match.

### What the platform does itself

The game does not take care of this: before the start and after every pause, the platform counts down 3 seconds. It pauses the match as long as a phone is gone (locked, no network) or no TV is connected, and shows the reason. If everyone plays on their own phone and the TV only shows extra (role `player` plus `"screen": { …, "optional": true }`, needs `"sdk": "^0.1.7"`), the match starts and runs without a TV; see the SDK README under "Roles". The host can pause. An error in `tick` pauses the match at the last good state. Joining is only possible in the lobby between rounds.

## The UI

- The UI runs in an isolated iframe. It talks to the platform only via `@gamehearth/sdk/client`: `connect()`, `game.onUpdate(...)`, `game.move(input)`. A game with a TV calls `connect({ screen: true })` and then asks `game.role`: `"screen"` is the TV (no seat, no inputs, only `public`), otherwise it is a phone with `game.seat`. `client/src/main.ts` does it this way.
- No `fetch`, no WebSocket, no images or fonts from other addresses; only files from your own build.
- **Smoothing:** the server sends 20 updates per second, the TV draws 60. `createTimeline(game)` from the SDK returns `{ from, to, alpha }` in every frame; you blend positions with `lerp(from, to, alpha)`, everything else (points, who is the catcher) you take from `to`. See `client/src/screen.ts` and `blendPositions` in `client/src/view.ts`. If a character jumps (for example back to the start), don't blend but set it.
- The controller only sends when something changes (press, release), and sends a release when the window is left. Every button also works with the keyboard.
- Phaser 4, not Phaser 3: examples on the web are often Phaser 3. Stick to the patterns in `client/src/screen.ts`; error messages about unknown methods usually come from Phaser 3 code. In Phaser, `update()` redraws every frame; don't create new objects per frame there, but reuse them (like the name tags in the example).
- Graphics and sound: easiest to draw with Phaser (as in the example). Your own files go into `client/public/` and need a CC0, CC-BY or CC-BY-SA license; no images from the internet without a clear license.
- **Cover:** `cover` in `manifest.json` names the picture the platform shows for the game, a file in the built client folder (the example's `client/public/cover.svg` ends up as `dist/client/cover.svg`). PNG, WebP or SVG, aspect ratio 4:3, at most 256 KB; `npm run check` checks it. Without image tools, pixel art as SVG is easiest: `<rect>` elements on `viewBox="0 0 64 48"` with `shape-rendering="crispEdges"`. Replace it with a picture of your game.

## Languages

The example speaks English and German; the German is only an example of a translation. Replace it with the languages of your game (see "Who you work with").

- **`manifest.json`:** `"languages": ["de", "en"]` lists the languages, the first is the default; for an English-speaking person `["en"]`. `name`, `description` and every `label` (options, choices, `items`, `stats`, `flags`) are one text for all languages or one text per language: `"label": { "de": "Dauer", "en": "Duration" }`. `npm run check` reports a missing language as an error and plain texts in a game with several languages as a warning; a text that is the same in every language (a proper name, a number) may stay plain. The name of the game is such a proper name only if it really is one (Mau-Mau); a title that describes the game (Higher or Lower) gets one text per language, in `manifest.json` and in `client/src/texts.ts` (`new --name` writes it into both as one text).
- **UI:** every text players see or hear is in `client/src/texts.ts`, made with `defineTexts` from `@gamehearth/sdk/client`: one block per language with the same keys (a key missing in one language is a type error), functions for numbers and plurals. After `connect()`, `const t = texts(game.language)` takes the language the platform chose, on the TV as on every phone; `client/src/main.ts` passes `t` on. Every device has its own language, also in the same room. Numbers and times follow the language too (decimal comma in German, see `seconds`). Write the blocks in the order of `languages`: the first block is the fallback for every other language (`test/view.test.ts` checks that). Test the main texts in every language in `test/view.test.ts`.
- **The rules produce no texts for players.** The `message` of a rejected input is an English text for developers; if the UI explains a rejection, it shows its own text from `texts.ts` per `code`.
- The language does not change during a match; when a player switches it, the platform reloads the game. In `npm run dev` the selector at the top switches all frames, the TV included (also `/p1` and `/tv`), and reloads them; look at every language there.

## Typical errors

| Message or symptom | Cause and fix |
|---|---|
| `Math.random() is not allowed in games` | use `random` from `setup` or `ctx.random` in `apply` and `tick` |
| `Matches do not end after … seconds of game time` | build in a time limit that `tick` counts down, and have `result` check it |
| Match ends right away or never only in your own test, `ctx.options.duration` is `undefined` | the test calls `createMatch` without `options` |
| `mode "realtime", but it has no function tick` | `tick` is missing in `defineGame` or misspelled |
| `tick threw an error: …` | place and tick are given with it; replay with the given `--seed` |
| Warning: A tick takes long on the server | fewer objects in the state, don't rebuild in every tick what does not change |
| `on the first run … on the repeat …` | state outside the functions or randomness that cannot be repeated |
| Characters stutter on the TV | positions not blended with `createTimeline`, or new Phaser objects in every frame |
| Character keeps running although released | the controller sends no `none` on release (also on `pointercancel` and `blur`) |
| `is outside the game folder` | only import files from this folder and `@gamehearth/sdk` |
| `… has no text for "en"` | add the text in the missing language to this entry in `manifest.json`; remove a language from `languages` only if the person asked for that |
| `cover: … must have the aspect ratio 4:3` or `cover: … is missing in the built client folder` | fix the size (`viewBox`) of the picture, or put it into `client/public/` and build again |
| Type error `Type 'string' is not assignable to type '"steer"'` | an input as an object literal without a type; write `const action: MyInput = { type: "steer", … }` |
| UI stays empty, `dev` shows an error from the iframe | read the error message with file and line in the output of `dev` |
| In the browser console: `Unrecognized Content-Security-Policy directive 'webrtc'` | harmless: the platform's isolation forbids WebRTC also for browsers that know the rule; Chromium does not know it yet |

Every finding of `check` names a command that replays exactly this match (`npx gamehearth check . --players 3 --seed check-3-17`, with changed options with `--option`). With it you see all inputs one by one with their tick.

## Replacing the example

Once your own game stands, nothing of Tag may be left:

- `manifest.json`: set `languages`, `name`, `description`, `players`, `roles`, `options` and `stats` (plus `items` and `flags`, if the game needs any) to fit (without variants `options` goes away, without a profile `stats`). The stat of the example (`wins`) was never published in your game: if it goes away, also take it out of `ids.lock`, otherwise `check` reports it as missing. If no IDs remain at all, delete `ids.lock`; `check` creates it again with the game's first ID. `mode` stays `"realtime"`. The `id` comes from the folder name. If it does not fit (for example `my-game`), change it now in `manifest.json` and `package.json`: only lowercase letters, digits and hyphens. After the first release it never changes again.
- `package.json`: `description`, in English like the code.
- `src/`, `client/src/`, `test/`: rules, UI and tests of your own game. You may keep or change the file names, only `src/index.ts` must export the game as `default`. `client/src/texts.ts` gets the languages of your game; the example's German goes away unless German is one of them.
- `client/index.html`: title. `client/public/cover.svg`: a cover of your game.
- `README.md`: rules of your own game; remove the note "still contains the example" at the top.
- Finally search for leftovers: `Tag`, `Fangen`, `Catcher`, `catcher`, `TagState`, `TagAction`, `tagBack` and the export `tag` in `src/`, `client/`, `test/`, `README.md`, `manifest.json` and `package.json`.
- `AGENTS.md` and `CLAUDE.md` stay as they are. They mention Tag as the template's example.
- The original example then stays available for reference under `node_modules/gamehearth/templates/realtime/`, for example how `client/src/screen.ts` smooths or how `client/src/controller.ts` reads fingers and keys.

## More details

These files always match the installed version. Read them before you use something that is not in here:

- `node_modules/@gamehearth/sdk/README.md`: the full contract for rules and UI, realtime, roles and smoothing, platform errors, limits of the server sandbox
- `node_modules/gamehearth/README.md`: `dev`, `check`, `pack` and catalogs

Don't change anything in `node_modules` and don't switch off any checks. If the contract does not allow something, tell the person what does not work.

## Publishing

Before the first release, ask the person:

- **License:** preset are MIT for the code and CC0 for graphics (see `LICENSE` and `manifest.json`). Explain briefly: everyone may then use, change and pass on the game. Other allowed licenses: any OSI license for code, CC0, CC-BY or CC-BY-SA for graphics.
- **Name in the `LICENSE`:** who is named as the author; this is publicly visible.

Steps:

1. Raise the version in `manifest.json` and `package.json` (`0.1.0` → `0.2.0`), commit.
2. Upload the repo to GitHub. A tag starts the release CI: `git tag v0.2.0 && git push origin v0.2.0`. It builds the game package with `check` and `pack` and attaches it to a release.
3. For a Gamehearth server to install the game, it needs a **catalog**: a repo of its own with a `catalog.json`. Create it and add the game with `npx gamehearth catalog add catalog.json <package-url> --name "My catalog"`. On the server, an admin adds the raw URL of the `catalog.json` in the admin view ("Verwaltung") and installs the game. Details in `node_modules/gamehearth/README.md`.
4. To play, someone opens the server's address with `/tv` on the TV and pairs it in the lobby with a code.
