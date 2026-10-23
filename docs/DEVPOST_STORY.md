## Inspiration
Everybody knows this moment. You ask for the original song — and she plays a remix. You ask for the version from the film you love — and she plays some stranger with the same name. You say *"not that one"* — and it plays anyway.

**Alexa+ is not the problem.** She hears you fine, and she is brilliant at conversation. The problem is what happens in the final millimeter between understanding your voice and executing the action: she has to pick one item out of a messy real-world catalog, and **catalogs are full of traps**:
* **Remixes and karaoke versions** dressed up to look like originals.
* **Live recordings and same-name strangers** riding popularity algorithms.
* **Cheap cables** that lie about their fast-charging specs in the title.
* **Grocery swaps** that quietly ignore *"no added sugar"* or a household allergy.

A brilliant talker still needs a stubborn checker. **We built the missing referee.**
## What it does
**Intent Lock** is one small, deterministic referee (built as an MCP server) that stands directly between **Alexa+** and **any catalog with rows** — not just songs.

### 1. One Referee Across Every Catalog
* **Music:** Tells the original apart from the remix, the karaoke track, the live recording, the sped-up edit, and the same-name stranger.
* **Cables & Gadgets:** Catches the cheap cable that *claims* to be fast-charging in the title but fails in the actual specs, and blocks sponsored look-alikes swapped in at checkout.
* **Groceries:** Blocks the substitute that ignores *"no added sugar"* or sneaks in the one ingredient someone in the house is allergic to.

### 2. Three Honest Answers (Zero Silent Guessing)
For every single request, Intent Lock gives one of three verifiable outcomes:
1. **Locked:** *"Checked against the real catalog — this is the exact one."*
2. **An Honest Tie:** Two candidates are genuinely equal against your rules, so it shows you both *by name* and lets you tap the one you want. It never guesses silently.
3. **An Honest Refusal:** *"I cannot prove any pick is right, so I will not pick."* Better silence than playing the wrong song or shipping the wrong item.

### 3. Remembers Your Standing Rules & Speaks Your Language
Tell it once — *"after 10 PM, only lo-fi"* — and it enforces your rule automatically using your local clock before anything plays. And it understands how real people actually talk across **Hinglish, Tamil, Spanish, and plain English** — treating small, high-stakes words like *"nahi"* (*not this one*) as hard orders, not background noise.
## How we built it
Alexa+ does the talking — that part is hers and she is great at it. **Our referee does only the checking:**

1. **Live Catalog Lookup:** It takes your natural-language ask and queries live music catalogs, plus our audited shopping and grocery packs.
2. **Full-Candidate Lineup:** Instead of lazily trusting the #1 search result, it lines up *every* candidate the catalogs return.
3. **Rule-by-Rule Elimination (With Receipts):** It crosses out every candidate that violates your explicit words or standing rules, one by one, and **shows its working on a visual proof card** — displaying exactly who was rejected and why.
4. **Phonetic Sound-Matching:** Using `PanPhon`, it matches by **sound**, not just spelling, so accents, transliterations, and mixed-language asks still lock onto the right item.
5. **Survival of the Proven:** Whatever survives elimination is locked in. If two survive honestly equal → you choose. If none survive → it refuses.

Because Intent Lock is built as a standard **Model Context Protocol (MCP)** server, it plugs cleanly in front of Alexa+ and can guard any catalog without changing how the assistant talks.

## Challenges we ran into
* **Every catalog lies differently:** A remix in music is a spec-lying cable in shopping is an allergy swap in groceries. The traps change clothes across industries; we had to architect the referee to verify the *pick's attributes against user constraints*, rather than hardcoding for one store.
* **Small words, massive meaning:** *"Nahi"*, *"not the live one"*, *"the original"* — one small word completely flips the right answer. We had to make the parser treat negation and qualifier words as strict mathematical filters, not conversational decoration.
* **Whose clock is it?** Standing rules like *"after 10 PM, only lo-fi"* only make sense in the user's local timezone. We had to ensure the referee uses the host clock first, with a labeled server fallback.
* **Popularity beats correctness:** Search APIs are built to push the most famous or trending version, not the asked-for one. We watched the famous-but-wrong pick win again and again until we stripped popularity out of the decision and forced strict rule-elimination first.
* **Proof broke silently, twice:** Early in testing, the visual card showing the referee's working failed quietly — nothing looked broken on screen while nothing was actually being checked underneath. We rebuilt our pipeline so that every verification failure is loud and visible.

## Accomplishments that we're proud of
* **We mapped 38 real-world traps first:** Before writing demo code, we cataloged **38 everyday traps** real people actually hit — the remix, the karaoke track, the same-name stranger, the live-version trap, *"nahi"*, the spec-lying cable, the sponsored substitute, the allergy swap — and engineered the referee against real human frustration, not staged demos.
* **We fought a 165-run war (and fixed 36/36 failures):** We attacked our own system like an enemy, throwing **165 runs (55 asks × 3 hostile hosts)** at it across wrong spellings, mixed languages, and multi-catalog traps. Our own first pass chose the **wrong item 36 times. Intent Lock fixed all 36.**
* **The "Saiyaara" Hero Moment works live:** Ask for the original *Saiyaara* from *Ek Tha Tiger* and it locks the real **2012 original** — cleanly crossing out the 2025 remake and same-name strangers.
* **The 10:05 PM Standing Rule works live:** Say *"after 10 PM, only lo-fi"* at 10:05 PM, ask for a track, and it automatically locks the lo-fi version without being reminded.
* **It never lies to look smart:** When it cannot prove a pick, it refuses and shows why. That honesty is the product.

## What we learned
A smart talker still needs a stubborn checker. The final step — selecting the actual SKU or track from a messy catalog — is where voice assistants quietly fail people every single day, in every language, in every store. Checking is a small job, but it has to be done by something deterministic that never guesses.

## What's next for INTENT-LOCK
More catalogs behind the exact same referee — **pharmacies, ticketing, hardware parts, and local services** — anywhere a wrong pick costs money, time, safety, or trust. **One referee, any catalog with rows.**
