# Intent Lock — Devpost form fillings (simple words, ready to paste)

## Project name

Intent Lock

## Elevator pitch (pick one)

**Recommended (189 characters):**
Alexa+ understands you perfectly — then plays the wrong song. Intent Lock is a little referee that checks the real catalog before anything plays, so you get the song you actually asked for.

**Alternate 1:**
You ask for the original. She plays a remix. Intent Lock double-checks every pick before it plays, ships, or gets ordered — the right thing, every time.

**Alternate 2:**
Alexa+ is a brilliant talker — but catalogs are full of traps: remixes, knockoffs, swapped groceries. Intent Lock checks every pick against the real catalog first.

## The story

### Inspiration

Everybody knows this moment. You ask for the original song — and she plays a remix. You ask for the version from the film you love — and she plays some stranger with the same name. You say "not that one" — and it plays anyway.

Alexa+ is not the problem. She hears you fine, and she is brilliant at conversation. The problem is what happens next: she has to pick one item out of a messy real-world catalog, and catalogs are full of traps. Remixes that look like originals. Karaoke versions. Live recordings. A cable that lies about its specs. A grocery swap that ignores your allergy.

We built the missing referee.

### What it does

Intent Lock is **one small referee that stands between Alexa+ and every catalog** — not just songs.

**The same referee guards them all:**

- **Music** — the original vs the remix vs the karaoke vs the live version vs the same-name stranger.
- **Cables and gadgets** — the cheap cable that *says* it is fast-charging but is not, the sponsored look-alike swapped in at checkout.
- **Groceries** — the substitute that ignores "no added sugar", or the one thing in the house someone is allergic to.

**For every single pick, the referee gives one of three honest answers:**

1. **Locked** — "checked against the real catalog — this is the right one."
2. **An honest tie** — two recordings are genuinely equal, so it shows you both *by name* and you tap the one you want. It never guesses silently.
3. **An honest refusal** — "I cannot prove any pick is right, so I will not pick." Better silence than the wrong song.

**And it remembers your standing rules.** Tell it once — "after 10 PM, only lo-fi" — and it applies your rule by itself, using your clock, before anything plays. It works in your words, too: Hindi, Hinglish, Tamil, Spanish, plain English — including the small words that change everything, like *"nahi"* (not this one).

### How we built it

Alexa+ does the talking — that part is hers and she is great at it. Our referee does only the checking:

- It takes what you asked for and looks it up in the **real, live catalogs** (music, shopping, grocery sources).
- It lines up **every candidate** the catalogs return — not just the first one.
- It crosses out everything that breaks your words or your rules, one by one, and **shows its working** on a card: who was rejected and why.
- It matches by **sound**, not just spelling, so accents and mixed-language asks still find the right item.
- What survives the crossing-out is the pick. If two survive honestly equal, you choose. If none survive, it refuses.

It is a standard plug-in for Alexa+ (an MCP server), so it can sit in front of any catalog, not only the ones we tested.

### Challenges we ran into

- **Every catalog lies differently.** A remix in music is a spec-lying cable in shopping is an allergy swap in groceries. The traps change clothes; the referee had to check the *pick*, not the catalog.
- **Small words, big meaning.** "Nahi", "not the live one", "the original" — one small word flips the right answer. The referee had to learn to treat those words as orders, not decoration.
- **Whose clock is it?** "After 10 PM" only makes sense on *your* clock. We had to make the referee ask the host for the time instead of trusting its own.
- **Popularity beats correctness.** Catalogs push the famous version, not the asked-for one. We watched the famous-but-wrong pick win again and again until the referee started crossing out by rules, not by fame.
- **Proof broke silently, twice.** The card that shows the referee's working failed quietly during testing — nothing looked wrong while nothing was being checked. We learned to make every failure loud.

### Accomplishments that we're proud of

- **We wrote down the traps first.** 38 everyday traps real people actually hit — the remix, the karaoke, the same-name stranger, the live-version trap, "nahi", the spec-lying cable, the sponsored substitute, the allergy swap — and built the referee against that list, not against demos we invented to look good.
- **Then we attacked it like an enemy.** We threw **165 messy real-world asks** at it — wrong spellings, mixed languages, traps in every catalog. The normal way of picking chose the **wrong item 36 times. We fixed all 36.**
- **The hero moment works.** Ask for the original *Saiyaara* from *Ek Tha Tiger* and it locks the real 2012 original — past the 2025 remake and the same-name strangers.
- **The rule moment works.** Say "after 10 PM, only lo-fi" at 10:05 PM, ask for the song, and it locks the lo-fi version by itself.
- **It never lies to look smart.** When it cannot prove a pick, it says so. That honesty is the product.

### What we learned

A smart talker still needs a stubborn checker. The last step — the actual pick from a messy catalog — is where voice assistants quietly fail people every day, in every language, in every store. Checking is a small job. It just has to be done by something that never guesses.

### What's next

More catalogs behind the same referee — pharmacies, ticketing, local services — anywhere a wrong pick costs money, time, or trust. One referee, every catalog.

## Built with

- MCP (Model Context Protocol) — the standard plug Alexa+ uses
- Python + FastAPI — the referee itself
- Gemini — the borrowed talking brain in our simulator (Alexa+ plays this role in real life)
- iTunes + Deezer + MusicBrainz — the live music catalogs it checks
- YouTube Suggest — spelling helper only, never a decider
- PanPhon (open source, ours on GitHub) — the sound-alike matching
- HTML/CSS — the card that shows the referee's working

## Team

Built by **THE YAP PATROL** — Aditya (founder) and Petu (his AI assistant).
