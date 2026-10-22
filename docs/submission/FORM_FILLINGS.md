# Devpost form fillings — Intent Lock (ready to paste)

*Written in plain words, the way we'd explain it to a friend. Everything below is true and checked against the submission packet — no new claims, no new numbers.*

---

## Project name

```
Intent Lock
```

## Elevator pitch (recommended)

```
Alexa+ understands you perfectly — then plays the wrong song. Intent Lock is a little referee that checks the real catalog before anything plays, so you get the song you actually asked for.
```

**Alternates (if you want a different flavour):**

```
You asked for the original. She played a remix. Intent Lock is a small checker that sits between Alexa+ and the catalog and proves the exact song before it plays — or honestly says it can't.
```

```
Alexa+ is a brilliant talker, but the catalog is full of traps — remixes, karaoke copies, songs with the same name. Intent Lock checks every pick against your own words before anything plays.
```

---

## Project story (paste section by section)

### Inspiration

Everyone who owns a smart speaker knows this moment. You ask for a song — the original one, from that old film — and something slightly wrong starts playing. The remix. A karaoke version with no singer. Or a completely different song that just happens to have the same name.

Alexa+ herself is brilliant. She understands you — your accent, your half-remembered words, even when you mix two languages in one sentence. Understanding was never the problem. The problem starts one step later, when her pick reaches the music catalog. The catalog is a messy place: the same title hides a remix, a karaoke copy, and a same-name stranger from another film — and nothing checks the answer before it plays.

We built this because we kept living that frustration, and because we think the fix should be small, honest, and free. Alexa+ does the talking — she's great at it. Somebody just needs to check her pick before it plays. That's us.

### What it does

Intent Lock is a small checker that sits between Alexa+ and the catalog. Before anything plays, it looks at your actual words and checks the real catalog answers against them, one by one:

- You said "not the remix"? The remix is out — even if you said "no" in Hindi, Tamil, or Spanish.
- You named the film or the singer? That decides the family first, so a same-name stranger from another film can't sneak in.
- The words arrived a bit mangled by your accent? It matches songs by how they *sound* (sound-alike matching), not just how they're spelled — "Sayaraa" still finds "Saiyaara".

Then it gives one of three honest answers, shown on a proof card we call the Trust Card, with every rejected version listed and the plain reason why:

- **Locked** — this is provably the one you asked for. It plays.
- **A tie** — two recordings honestly score even. It shows you both by name and asks you to pick, instead of guessing.
- **No lock** — it couldn't prove a pick, so nothing plays. It would rather stay silent than play the wrong thing.

And three little bonuses, because day-to-day life needs them:

- **It remembers your standing rule.** Say once, "after 10 PM, that song means the lo-fi version," and from then on your plain request follows your rule — with the reason printed on the card.
- **It works beyond songs, too.** The same check guards a shopping pick (a cable whose listing brags one speed while its own spec sheet says another gets caught) and a grocery reorder (a sponsored swap for the oat milk you asked for gets caught the same way).
- **It costs nothing to run.** No account, no keys, no settings. The music catalogs it checks are free public ones.

### How we built it

Intent Lock is a small server that speaks MCP — the open standard Alexa+ uses to talk to outside tools — so any assistant that speaks it can use the same checker. In our demo, Alexa+ is played by a stand-in host (a simulator we built, clearly labelled), because that's the honest way to show it today.

The checker itself has no AI model inside it at all. It's a short line of simple, fixed steps: read what the person actually said (including their "no"), remember their standing rules, go and fetch the real answers from live free catalogs (iTunes, MusicBrainz, Deezer — plus YouTube's suggestions used only as a spelling helper, never as a source), match them by sound, throw out the traps with a written reason for each, and only then decide: lock, tie, or refuse.

Around it we built a small stage to show it working: a web page that looks and talks like Alexa+, a go-between that carries the conversation, the checker itself, and a "chaos" button box that lets us break things on purpose — kill the connection, cut the session — to prove the checker stays honest under attack.

The sound-matching heart also ships on its own as a free open-source package (polyglot-phonetic-judo), so any voice app fighting the accent barrier can use it without us.

### Challenges we ran into

- **The proof card kept rendering broken — silently.** The platform blocks outside images and audio unless you declare them first, and it never shows an error; the card just looks broken. We only found it by auditing our own work, and we wrote it up so the next team doesn't have to.
- **Our first plan for settling ties rested on a feature that's being retired.** We redesigned: instead of the server quietly picking, a tie now goes back to the asker to choose, and the server re-checks that choice before anything plays. It turned out more honest anyway.
- **"After 10 PM" is about *your* evening, not the server's clock.** A checker sitting in another timezone can't be trusted with your rules, so the time now travels with each request, and the checker is built to never quietly substitute its own clock.
- **Catalogs answer spellings, not sounds.** There is no catalog row for "Sayaraa" — the song lives under its proper spelling. So the checker first works out the likely spellings of what you said, then goes looking. Treating the catalog answers as evidence — sometimes thin, sometimes missing — instead of gospel was the mindset shift that made it all work.
- **Popularity kept beating quality.** Early on, a famous karaoke version could outrank the real recording. We fixed the order of the checks so a popular trap can't outvote the evidence.

### Accomplishments that we're proud of

- **It works on the song that started all this.** Ask for "Sayaraa" the way a person actually says it — mixed-up, accented, "not the remix" added almost as an afterthought — and the checker locks the original 2012 film recording, with the remix, the karaoke cut, and the 2025 same-name stranger all rejected on the card, each with its reason.
- **We attacked it ourselves, and published the score.** We threw 165 hostile test sessions at it — messy, careless, real-world asks. It found **36 wrong picks** along the way. We fixed every single one, ran the same attacks again, and all 36 now come out right. The safety rules never broke in any run: no banned version ever slipped through.
- **The standing rule really fires.** Tell it once that late-night Saiyaara means the lo-fi mix, and at 10:05 PM a plain "play Saiyaara" locks the lo-fi mix — the rule learned its exact recording from the time it was proven right.
- **No AI inside the checker.** We actually removed a model we'd put in to settle ties, on principle: one AI judging another isn't a guarantee. Fixed steps, same evidence, same answer — every time.
- **We labelled everything honestly.** What's real, what's simulated, what's borrowed — it's written on the tin, in the repo, and in a plain-words page for non-programmers. Our list of things that went wrong during the build (the friction log) names our own mistakes before anyone else has to find them.

### What we learned

- **Don't fix the transcript — check the pick.** We assumed the problem was hearing. It wasn't; Alexa+ hears fine. The recoverable mistakes live one step later, in what gets picked. Checking the pick rescues requests that were already understood.
- **"I can't prove it" is a feature, not a failure.** A checker that can refuse — and can show a tie instead of flipping a coin — is the only kind you'd trust anywhere near a play button or an order button.
- **Measure it or it didn't happen.** Early on we were handed lovely numbers about our own matching that didn't survive being measured. Every number in this story now comes from the real thing, run against real catalogs.

### What's next

- **More languages, the easy way.** The word-lists that teach the checker new "no"s and local phrasings are simple files anyone can extend — the next language is a small reviewed addition, not a rewrite.
- **More everyday catalogs.** Travel, food delivery, smart-home gear — anywhere a listing can lie or a same-name trap can hide, the same little referee can stand guard.
- **The bigger hope:** every voice assistant shipping today makes picks nobody checks. Brilliant talker up front, honest checker at the catalog — we'd love that to become the normal way these things are built.

*Alexa guesses. Intent Lock proves. Borrow the Brain, Own the Guarantee.*

---

## Built with (paste into "Built with")

```
Model Context Protocol (MCP) · Python · FastAPI · TypeScript · Node.js · Next.js · React · Gemini (host brain in the simulator — borrowed, labelled) · iTunes Search API · MusicBrainz API · Deezer API · YouTube Suggest (spelling helper only) · OpenFoodFacts · Web Audio API · Docker · GitHub · polyglot-phonetic-judo (our own open-source package)
```

---

*Built by **THE YAP PATROL** — Aditya (founder) and Petu (his AI assistant) — for the Amazon "Build, Ship, Shape" Developer Hackathon, Alexa+ Track.*
