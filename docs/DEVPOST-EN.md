# Devpost submission: draft (English)

> **How to use this file.** It is the text to paste into the Devpost form for *Dakar Bitcoin Hack #4*, written to be accurate on the day it was written (2 Nov. 2026). Every `[TO CONFIRM]` must be settled by the team before submitting; nothing in square brackets is a claim yet. If something here stops being true, change the text, not the code. The honest "what is real" table below is part of the pitch: judges can test the app, and a prototype that says exactly what it does is stronger than one that says more.

---

## Name

**NobPay**

## Tagline (one line)

Pay on proof: money sent home is released step by step, in sats, only when the work is shown.

## Elevator pitch (about 50 words)

The African diaspora sends hundreds of billions of dollars home, and much of it funds a house, a field, a school year or a shop run from afar, on someone's word. NobPay holds the money in escrow and pays the supplier directly, over Lightning, only when the proof arrives. Anyone can verify the record.

---

## Inspiration

A transfer moves money; it does not control what the money is used for. A family abroad paying a builder, a school or a wholesaler in Senegal has two bad options: send it all and hope, or send nothing. The IFAD report published on 14 September 2026 puts remittances to Africa at US$124.2 billion for 2025 and says close to a third of the money to low and middle income countries reaches rural areas (sources: [UN News](https://news.un.org/en/story/2026/09/1168330), [IFAD](https://www.ifad.org/en/w/news/remittances-nearly-doubled-in-a-decade-to-reach-us-729-billion-in-2025-new-ifad-report-finds)). These figures describe the market, not results of NobPay.

NobPay was born at the Code & Chain Dakar hackathon (17-18 October 2026). Everything described below that is marked *new* was built **after** the opening of this hackathon (26 October), and is listed in [`docs/CHANGELOG-DBD4.md`](CHANGELOG-DBD4.md); `git diff pre-dbd4..HEAD` shows all of it.

## What it does

One engine, three corridors:

1. **A project back home**: a house, a field, a shop (the original NobPay).
2. **School fees**: the family abroad pays the school, term after term, against the school's receipt. *(new)*
3. **A merchant's restock**: the wholesaler is paid when the goods are in the shop, not before. *(new)*

How a payment goes:

1. The funder creates a project, split into steps (templates for each corridor, editable), and funds it with a **Lightning invoice**. The money sits in escrow, counted per project.
2. The person on site, who needs **no account**, opens a private link and sends dated, geotagged photos, the invoice, and who to pay.
3. The funder gets a **second opinion** before deciding: automatic checks (is this photo or invoice already used somewhere else? was the phone in Senegal when it sent the proof, and are the photos recent? does the invoice match the step?) and, on request, **Claude's advice** on the photos and the invoice. *(new)* The AI reads; plain code compares; the funder decides. The advice never blocks or triggers a payment.
4. On approval, the supplier is paid **in sats at their Lightning address**, and the receipt shows the **preimage**, the cryptographic proof of payment. Unused escrow can be refunded. *(new)*
5. Every event goes into a **hash-chained ledger**. Its fingerprint is anchored on Bitcoin with OpenTimestamps, and each event is also **published on Nostr relays** as a signed commitment that carries no name and no amount. A public page **re-checks everything in the visitor's browser**, including asking the relays itself. Nobody has to trust our server. *(new)*

**Around the project (new).** The funder can name an **independent witness** who sees each proof from outside and answers "confirmed" or "disputed" (written in the ledger); the funder can make that confirmation a **condition of payment**. A **family link** lets relatives add to the escrow from any Lightning wallet, with no account, and without any power to release or take back. **Web Push notifications** (no SMS) tell the funder, the field team and the witness when something needs them. This is what paid platforms sell with salaried inspectors, as a private link and a ledger entry.

A one-click **"Essai rapide"** creates a 15 $ trial (three steps of 5 $) so a juror can see the whole path in a few minutes. *(new)*

## What is real, and what is not (as of 2 Nov. 2026)

| Piece | Status |
|---|---|
| Funding over Lightning (NWC, NIP-47), credited only when the wallet confirms the invoice at the invoice amount | Implemented and tested end to end against a **scripted wallet**, and the adapter against a **real NIP-47 wallet service** (from Alby's SDK) on a simulated relay. **Not yet run with a real wallet and real sats.** `[TO CONFIRM: pilot instance with real sats, date]` |
| Supplier paid at a Lightning address (LNURL-pay), invoice checked before paying, preimage as proof | Same status as above |
| Mobile money payout (Wave / Orange Money / Free Money) through Bitnob | Run end to end in the **Bitnob sandbox** (earlier in the project); not on the real-sats instance |
| Refund of unused escrow | Implemented and tested against the scripted wallet |
| Hash-chained ledger, browser-side verification, OpenTimestamps anchoring | **Real**: public calendars, downloadable `.ots` proof |
| Nostr commitments (kind 8421) and NIP-03 attestations | Tested against fake relays, and the verification page was checked in a browser against real relays in **read-only**. **Publishing to real relays has not been tried yet.** `[TO CONFIRM after running scripts/nostr-smoke.mjs]` |
| AI advice on proofs (Claude) | Tested with a fake client. **Never run against the real API yet.** `[TO CONFIRM]` |
| Custody | The escrow is held by the **instance's own wallet** (a custodial design, bounded by pilot ceilings and a solvency check that pauses payments if what we owe exceeds what the wallets hold). It is not a licensed financial service. |

## How we built it

- **Next.js 16, React 19, TypeScript (strict), zod 4**; a single process with an append-only, hash-chained ledger; a file database for now (SQLite is planned). 884 automated tests; Docker and Caddy deployment files.
- **Lightning without an intermediary**: Nostr Wallet Connect (NIP-47) with two connections of different rights: one that can only make and look up invoices (it cannot spend), and one that pays and carries a budget. Our own BOLT11 decoder (the invoice libraries did not expose the description hash that LNURL-pay requires) and an SSRF-safe HTTPS client for Lightning addresses.
- **Money safety under uncertainty**: a payment is only believed with a preimage that hashes to the invoice; a lost answer keeps the funds reserved and the payment is looked up by its hash, never repeated; "never sent" is concluded only after five minutes without a trace.
- **Nostr**: one signing key per project derived from a master key, named in the first ledger event (so the Bitcoin anchor also commits to it), regular (non-replaceable) events so a forged second version appears next to the first, and NIP-03 proofs reduced to a single Bitcoin attestation.
- **AI**: the official Anthropic SDK with structured output; privacy by minimisation (no funder name or phone, no GPS positions, only when asked); a daily cap and per-account limits; refusals and failures show plain messages.

## Challenges we ran into

- **Not having a wallet to test with.** We built a fake relay and drove our adapter with the real wallet-service implementation from Alby's SDK, with the real encryption. It found no bug, but it proved the messages we send are understood.
- **Relays are not a database.** A replaceable event kind would have let an operator silently overwrite a commitment, so we chose a regular kind. Our first choice (8173) was already used by another application, which we only found by reading the relays.
- **Lightning addresses are URLs typed by users.** A server that fetches them can be made to call its own network. The client checks the address it connects to at connection time, refuses redirects, and bounds size and time.
- **Small amounts.** Lowering the minimum budget so a trial costs 15 $ exposed a template that produced a 0 $ step; fixed and tested.

## Accomplishments we are proud of

- A payment path where **every claim a wallet or another server makes is checked before it is believed**.
- A verification page that **works without our server** (it asks Bitcoin calendars and Nostr relays itself).
- An AI feature that is **honest about its role**: it reads, code compares, the person decides.
- Everything is in the open: MIT licence, a changelog that separates this hackathon's work, tests that say what is real.

## What we learned

Escrow is a bookkeeping promise until the books can be checked by someone else. Publishing hashes on Nostr and on Bitcoin turns "trust us" into "check us". And the hardest part of paying over Lightning is not paying, it is what to believe when the answer is lost.

## What's next

- Run the pilot with real sats and publish its results `[TO CONFIRM]`.
- A **mobile money adapter for Senegal** behind the same interface, so the supplier can be paid in FCFA where Lightning is not yet usable (Bitnob today; Banxaas, a Dakar startup, is the local option we want to talk to `[TO CONFIRM: API access]`); USSD for people without a smartphone.
- Wolof in the interface (beta), English interface, SMS and Nostr (NIP-17) notifications.
- SQLite, and a standalone open-source NWC test harness and OpenTimestamps helpers for other builders.

---

## Built with

`bitcoin` `lightning` `nostr` `nip-47` `nip-03` `opentimestamps` `lnurl-pay` `next.js` `typescript` `claude`

## Try it out

- **Live app**: `[TO CONFIRM: URL]`. On the real-sats instance a juror enters with "Try without an account" and the "Essai rapide" (15 $).
- **Source code (MIT)**: `[TO CONFIRM: https://github.com/mouhaa-md/NobPay]`
- **Public verification page** (no account): `[TO CONFIRM: URL]/verifier`
- **Video**: `[TO CONFIRM]`

## Team

`[TO CONFIRM: names, roles, country of residence. The rules require participants to reside in Africa.]`

---

## Judging criteria: where each one is answered

| Criterion | In the project |
|---|---|
| A testable MVP | The live app with a trial that takes minutes; the public verification page |
| Usefulness and impact | Three real needs of the diaspora and of small merchants in Senegal on one engine |
| Security by design | Two wallet connections with different rights; ceilings; solvency check; SSRF-safe client; proofs for every wallet answer; privacy-minimal commitments and AI requests |
| UX/UI | A person on site with no account; a funder who is told exactly what to look at; plain French messages |
| Originality | Pay on proof with Lightning, Nostr commitments and a verification that does not need us |
| Technicality | NIP-47 two-wallet design, own BOLT11 and LNURL checks, NIP-03 proofs, 846 tests |

## Before submitting (checklist)

- [ ] Replace every `[TO CONFIRM]`; delete the sentence if it cannot be confirmed.
- [ ] Run `node scripts/nostr-smoke.mjs` (it publishes one test event on the relays you choose) and update the Nostr row.
- [ ] Run one real-sats funding and one payment to your own Lightning address; update the first three rows.
- [ ] Run one AI review on a real proof and read the advice before saying anything about its quality.
- [ ] Screenshots: the funding invoice, a proof with its checks, the receipt with the preimage, the verification page with the Nostr row.
- [ ] Post the build-in-public notes on Nostr and X (mention Btrust and `#DakarBitcoinHack`).
