# Kritzelkiste

**Kritzelkiste** (English: *Doodle Box*) is a draw-and-guess game for phones on Gamehearth, the self-hosted game platform. One player draws a word with a finger, the others guess on their own phones. Whoever guesses faster gets more points. A TV is not needed; if one is paired, it shows the picture big. The game speaks German and English.

The game gets onto a Gamehearth server through a catalog, for example the [Gamehearth catalog](https://github.com/hearthbit/gamehearth-catalog): add the catalog in the admin view ("Verwaltung") and install Kritzelkiste.

The look follows the chosen draft "Skizzenbuch" (sketchbook, `docs/draft/`): warm paper with a fine grid, the picture as a taped-on sheet, the word for the drawer on a yellow sticky note, pencils in a pencil case and the tools within thumb reach.

## Rules

**For 2 to 10 people, each with their own phone.**

### Course of a match

- The order is drawn by lot at the start. In one round, everyone draws exactly once. The host sets the number of rounds in the lobby.
- Whoever's turn it is gets three words to choose from: an easy, a medium and a hard one, within 15 seconds. Whoever does not choose gets one of the three at random.
- Then they draw. Everyone else watches the picture appear and types guesses into an input field.
- A turn ends when the time is up, when everyone who may guess has guessed the word, or when the drawer passes.
- Then the answer is shown for 5 seconds: the word and who got how many points in this turn.
- After the last round there is a podium. Whoever has the most points wins; in a tie, everyone with the highest score wins. If nobody has any points at the end, nobody wins.

### Hints (letter boxes)

- Below the picture there is an empty box for every letter. Spaces and hyphens are visible from the start.
- After half of the time one random letter is revealed, after three quarters another one, but at most a third of the word.

### Points

| Who | Points |
|---|---|
| Whoever guesses right | 50 plus up to 100 by the remaining time: at once about 150, in the last second about 50 |
| The drawer | 30 for every person who guesses the word |

Both are multiplied by the difficulty: easy ×1, medium ×1.5, hard ×2. Only the drawer sees the difficulty.

### Guessing

- Upper and lower case do not matter. With German words, ä, ae and a count the same, likewise ö/oe/o, ü/ue/u and ß/ss. Accents, spaces, hyphens and apostrophes do not matter.
- Some words have alternatives; for example "Rad" also counts for "Fahrrad".
- **Close:** if only one letter is wrong (from 8 letters on, two), you see "knapp daneben!" / "close!"; the others do not see it.
- In a guess of several words, "close" also counts if one of the words (or two neighbouring words written together) is at most that far from the answer, for example "ein Leuchturm". A guess is only right if it is right as a whole.
- Guesses of more than three words (for longer answers: more words than the answer) do not count. Only you see them, crossed out with the note "at most 3 words".

### Who sees what

- Wrong guesses are seen by everyone, crossed out on a note.
- A correct guess is never shown as text. Everyone only sees "Mia hat es erraten!" / "Mia guessed it!".
- A close guess is seen only by whoever typed it.
- Whoever has guessed the word then sees it in green in their boxes.
- Whoever has guessed the word can keep writing. That is read only by the drawer and everyone who also knows the word.

### Own words (option)

- Before the first round, everyone can write down up to 3 own words, within 45 seconds; with "Fertig" / "Done" it starts earlier as soon as everyone is done.
- As long as own words of others are left, the medium one of the three offered words (×1.5) is one of them. An own word is never offered to its author for drawing.
- If several people wrote the same word, it exists only once, and all of them are its authors.
- When guessing, every author counts as having guessed already: no points, they see the word in their boxes and may write along.
- If an own word is also in the word list, the list word is not offered in this match.

### Drawing tools

10 pencils (black, gray, red, orange, yellow, green, blue, purple, pink, brown), 3 widths (fine, medium, thick), eraser, fill (at most 100 times per picture), undo (stroke by stroke) and clear. Clearing and passing need two taps, so that nothing happens by accident.

### TV (optional)

If a TV is paired, it shows in landscape the picture big on the left and, on the right, who is drawing, the letter boxes, the time, the points and the guesses. The game never waits for the TV.

### Profile

At the end of a match the profile stores:

| Entry | Meaning |
|---|---|
| Siege / Wins | number of matches won (with leaderboard) |
| Schnellster Treffer / Fastest guess | shortest time from the start of drawing to the correct guess (with leaderboard, less is better) |
| Punkterekord / Points record | most points in one match (with leaderboard) |
| Erratene Begriffe / Words guessed | how many words you have guessed in total |

## Options in the lobby

| Option | Values | Default |
|---|---|---|
| Rounds | 1, 2, 3, 4 (one round = everyone draws once) | 2 |
| Drawing time | 60, 80, 100, 120 seconds | 80 |
| Language of the words | German, English (everyone guesses in this language; the UI stays in each phone's own language) | German |
| Own words | yes / no | no |

## Languages

German first, English second. Every device shows everything in its own language. The word lists are two separate lists written for this game (about 125 words per difficulty each), not translations of each other. They are CC0.

## Trying it out

You need Node 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5180. The TV is at the top, below it one phone per seat. Every seat can also be a bot. With `npm run dev -- --host` it also works with real phones on the Wi-Fi: phone 1 opens `/p1`, phone 2 `/p2` and so on, the TV `/tv`.

## Structure

| Path | Content |
|---|---|
| `manifest.json` | name, languages, player count, roles (phone and optional TV), options, profile entries |
| `src/game.ts` | the rules: phases, times, points, guesses, who sees what |
| `src/guess.ts` | comparing guesses (umlauts, typos) and the letter boxes |
| `src/picture.ts` | the picture as compact text and sending it in pieces |
| `src/words-de.ts`, `src/words-en.ts`, `src/words.ts` | the word lists (CC0) |
| `client/src/table.ts` | the UI for phone and TV |
| `client/src/painter.ts`, `client/src/raster.ts` | drawing on the canvas and filling on a picture of fixed size |
| `client/src/sync.ts` | gets the drawer's strokes to the server reliably |
| `client/src/view.ts` | everything the UI decides (notes, boxes, points, sizes); easy to test |
| `client/src/texts.ts` | all texts in German and English |
| `client/src/style.css` | the look after the draft "Skizzenbuch" |
| `client/public/cover.svg` | the cover (CC0) |
| `docs/draft/` | the chosen draft |
| `test/` | tests for rules, guesses, picture and UI |

**How the picture travels:** every stroke is stored as a short string (color and width, then 4 characters per point on a sheet of 600 × 600 points). The drawer's phone sends new points about 10 to 20 times per second in small pieces; if a piece gets lost, it simply sends what is missing again, but at most every 0.3 seconds while the server does not move on (for example during a pause). The whole picture is in the state, so a phone that reconnects and the TV always see the whole picture. Watchers see the picture about a tenth of a second late, but appearing evenly instead of in jumps. Every device computes fills itself on the same picture of fixed size.

## Developing

The game is easy to extend with an AI agent (Claude Code, Cursor, Copilot …). The instructions for the agent are in [AGENTS.md](AGENTS.md).

| Command | Purpose |
|---|---|
| `npm run dev` | starts the game locally with the TV and all phones in the browser |
| `npm test` | tests |
| `npm run typecheck` | type check |
| `npm run check` | checks the game like the platform does, with bot matches tick by tick (takes a few minutes) |
| `npm run pack` | builds the game package for a catalog |

## Decided by the agent, please check

These points were open. They were decided as follows; say so if you want them otherwise.

1. **Pass:** the drawer can end the turn with "Passen" / "Pass" (flag on the sticky note, two taps) if a word cannot be drawn. Points awarded until then stay. The platform's check needs it too: its test bots never guess right, and without passing a match with many people would last longer than the allowed 10 minutes of game time.
2. **Offered words are used up:** all three offered words do not come again in the same match, also an own word that was offered as the medium word but not chosen. So nobody later knows a word they were only offered.
3. **Own words only from 3 people:** with two players nobody would be left to guess an own word (its author counts as having guessed). With two players the option therefore has no effect. In general, an own word is only offered if someone besides the drawer and its authors can guess.
4. **What an own word may be:** at most 20 typed characters of letters (also umlauts and accents), digits, spaces, hyphens and apostrophes, at least 2 of them letters or digits ("ß" alone is not enough). Duplicate words count once; everyone who wrote it is an author. Icelandic letters are compared like in transliteration: þ as "th", ð as "d" (so "Thor" counts for "Þór").
5. **"Fertig" / "Done" button** for own words, so that nobody has to wait the full 45 seconds.
6. **Guesses of several words:** "ein Leuchtturm" or "ein Leuchturm" counts as close (only visible to you), because otherwise the answer would stand visible to everyone as a wrong guess. The single words and every two neighbouring words together are compared, with the normal typo limit; a word that only contains the answer ("Kreis" for "Eis") does not count. So that nobody tries a whole list of words at once, guesses of more than three words do not count at all and are shown only to whoever typed them. Because one typo counts as close, "Rohr" for "Ohr" or "Wald" for "Wal" stays close.
7. **Swapped letters** ("Igle" instead of "Igel") count as one typo. The "8 letters" for two typos are counted after simplifying (ä → a and so on).
8. **ae/oe/ue:** because ä and ae should count the same, with German words "ue" is always treated like "u" (also in "Feuer"). In rare cases this can make two different words equal. With English words this does not apply; otherwise "mosue" for "mouse" would no longer be a typo.
9. **Exact points:** guesser: 50 + (100 × remaining time ÷ drawing time), rounded down, then times the difficulty and rounded. Drawer: 30, 45 or 60 per correct guess. In a tie, everyone with the most points wins. **If nobody has any points at the end** (for example because everyone passed), nobody wins, and nobody gets a win in the profile.
10. **Revealed letters:** for words with fewer than 3 letters none is revealed, for 3 to 5 letters one.
11. **Profile only at the end:** wins, records and counters are stored only at the end of the match. An aborted match does not count. The points record is stored only with more than 0 points.
12. **The drawer does not write along:** they read what those who know the word write, but have no input field, so that the tools stay within thumb reach.
13. **Pencil case in two rows:** ten pencils with tap targets of at least 44 px do not fit side by side on a phone. The pencil case therefore has two rows of five (the draft had one row of eight).
14. **Narrow phones (below 350 px width):** the three widths become one button that cycles with every tap (fine → medium → thick).
15. **Font:** the game ships no font of its own. The handwriting comes from the device's fonts: Segoe Print/Ink Free on Windows, Noteworthy/Bradley Hand/Chalkboard on iPhone and Mac, "Coming Soon" on Android, otherwise a cursive font. It therefore looks somewhat different per device. If it should look the same everywhere, a free font (for example "Patrick Hand" or "Gochi Hand", OFL license) can be added together with its license file.
16. **Keyboard:** as soon as you tap into the input field, everything moves into the top half: the sheet gets smaller, clock and round move beside it, the notes fold into one line, the input field sits below. The game does not know the exact height of the keyboard; it assumes about 45 % of the height. The button "5 Tipps" / "5 guesses" closes the keyboard again and shows all notes.
17. **TV:** shows the score list instead of the player strip, and only the public guesses, not what those who know the word write.
18. **Picture size:** a picture has at most 6000 points and at most 100 fills (every device recomputes all fills when redrawing; more would get slow). If the sheet is full, a note appears; then undo or clear helps. A fill counts as one point. The eraser draws in paper color.
19. **Two devices on the same seat:** if someone draws on two devices at once, the device being drawn on wins; the other one only shows.
20. **Avatars** are the initials of the names in colored circles.
21. **Difficulty only for the drawer:** the guessers do not see whether a word is easy, medium or hard; that would halve the possible words.
22. **Own words and the word list:** if an own word (or one of its spellings) is also in the word list, the list word does not appear in this match, so that the same word is not offered twice.
23. **Reveal:** during the 5 seconds after a turn, the header says "Auflösung" / "The answer" instead of who is drawing.
24. **License:** code MIT, graphics and word lists CC0 (see `LICENSE`).
