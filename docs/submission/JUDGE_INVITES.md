# JUDGE INVITES — private repo collaborator access

**Repo:** `AdityaPagare619/omnibeat-mcp` (PRIVATE, MIT) — judges can only see it if invited. No invite = judges cannot open the code = the submission's required repo link is dead for them. This step is as load-bearing as the Devpost form itself.

## ⚠️ Discrepancy the founder must know about (verified 2026-10-20)

The **live Devpost pages name FIVE collaborators**. Both the overview and the official rules (§ Submission Requirements) say, verbatim:

> "Amazon Developer Relations GitHub profiles: Kourtney Meiss: knmeiss, Giovanni Laquidara: giolaq, Anisha Malde: anishamalde, Moses Roth: mosesroth, Emerson Sklar: emersonsklar. Make sure this repo is private, then add these GitHub users as collaborators so they can review my submission: knmeiss, giolaq, anishamalde, mosesroth, emersonsklar."

The panel's working list has **SIX** names — the five above **plus `chris-trag`**. Chris Melissinos (Principal Evangelist, AWS) **is** a listed judge on the hackathon page, but his GitHub handle does **not** appear in the official collaborator instructions.

**Decision: invite all six.** Adding one extra listed judge as a collaborator costs nothing, violates nothing, and covers both sources. If the panel's sixth name is right, we're covered; if the page's five are the complete set, the extra invite is harmless.

## Who to invite (all six + Devpost testing access)

| # | GitHub username | Who | Source |
|---|---|---|---|
| 1 | `knmeiss` | Kourtney Meiss — Developer Evangelist | Devpost page + rules |
| 2 | `giolaq` | Giovanni Laquidara | Devpost page + rules |
| 3 | `anishamalde` | Anisha Malde | Devpost page + rules |
| 4 | `mosesroth` | Moses Roth | Devpost page + rules |
| 5 | `emersonsklar` | Emerson Sklar — Chief Evangelist, Alexa | Devpost page + rules |
| 6 | `chris-trag` | Panel-supplied sixth name (judge Chris Melissinos) | Panel record — **not** on the Devpost page; invite anyway per decision above |
| + | `testing@devpost.com` | Devpost's judging-access address | Rules: a private repo must be *"shared with testing@devpost.com and the Amazon team"* |

(The rules page renders the Devpost address as a masked mailto link; `testing@devpost.com` is Devpost's standard judging-access address. At invite time, confirm the exact string by hovering the link in §"Submission Requirements" of the live rules page.)

## Exact steps (GitHub, ~4 minutes for all)

For **each** username above:
1. Open **https://github.com/AdityaPagare619/omnibeat-mcp/settings/access**
2. Click **Add people**.
3. Type the username exactly as listed → select the matching account → **Add**.
4. Repeat for all six. (On a personal repo, collaborators receive read/write by default — there is no read-only role outside an organization. That is normal for hackathon judging; access can be removed after winners are announced ~Dec 3.)
5. For Devpost testing access: on the same **Add people** prompt, enter `testing@devpost.com` and add it if GitHub resolves it to an account.
6. Screenshot or note the Collaborators list showing all pending invitations — this is the proof-of-invite record.

## Timing — the 7-day trap (rules-quoted)

The overview warns, verbatim: *"each person has to accept the invitation, and GitHub invitations expire after 7 days. Add the reviewers when you submit rather than weeks in advance, and if you added anyone earlier and the invitation has lapsed, re-send it from the same Collaborators page."*

Judging runs **Nov 9–20, 2026** (rules §1) — up to four weeks after the deadline. An invite sent Oct 23 that sits unaccepted **dies on Oct 30**, before judging even opens. The rules also require the project to remain available to judges *"until the Judging Period ends."* Therefore:

| When | Action |
|---|---|
| **Oct 23 (submission day)** | Send all invites in the same sitting as the Devpost submission. Never earlier — earlier only starts the expiry clock sooner. |
| **Oct 30** | Open Settings → Collaborators. Re-send every invitation still showing "Pending". |
| **Nov 6** | Re-send any still pending. |
| **Nov 9 (judging opens)** | Verify: all six show as accepted collaborators, not pending. Re-send stragglers. |
| **Nov 13** | Final sweep — re-send anything still pending so no judge hits a dead link mid-judging. |
| **Until Nov 20** | Do not remove collaborators, do not rename/move the repo, do not change its visibility. |
| After Dec 3 (winners announced) | Access may be revoked at the founder's discretion. |

## Verification checklist

- [ ] All 6 usernames + testing access invited (Oct 23, with submission).
- [ ] Collaborators page screenshotted with pending invites visible.
- [ ] Oct 30 / Nov 6 re-send sweeps calendared.
- [ ] Nov 9: all accepted (or re-sent that morning).
- [ ] Repo untouched (name, visibility, ownership) through Nov 20.

---
*Prepared by Judge J-09, 2026-10-20. Username list and expiry warning quoted from the live Devpost overview and official rules, re-verified that date; the five-vs-six discrepancy is flagged, not hidden.*
