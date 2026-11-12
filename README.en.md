# NobPay

> **Pay on proof.** Money sent home is held in escrow and released step by step, in bitcoin over Lightning, only when the work is shown. Every event goes into a hash-chained record that anyone can verify from their own browser, without trusting us. *(Version française: [README.md](README.md).)*

**Try it online: [nobpay.onrender.com](https://nobpay.onrender.com)**, then tap "Try with the demo account". This is a **demo instance**: payments are **simulated** and no real bitcoin is involved. It runs on a free hosting plan: if the server was asleep, the first load can take about a minute, and demo data is reset at every restart.

NobPay was born at the **Code & Chain Dakar** hackathon (17-18 Oct. 2026) and is being extended for **Dakar Bitcoin Hack #4**. What was added for this second hackathon is listed apart from the base in [`docs/CHANGELOG-DBD4.md`](docs/CHANGELOG-DBD4.md); `git diff pre-dbd4..HEAD` shows all of it. MIT licence.

## The problem

A transfer moves money; it does not control what the money is used for. A family abroad paying a builder, a school or a wholesaler in Senegal can send everything and hope, or send nothing. Remittances to Africa were US$124.2 billion in 2025 and close to a third of the money sent to low and middle income countries reaches rural areas (IFAD, 14 Sept. 2026; [UN News](https://news.un.org/en/story/2026/09/1168330)). These figures describe the market, not results of NobPay.

## What it does

One engine, three corridors: **a project back home** (a house, a field, a shop), **school fees** (paid to the school, term after term, against its receipt) and **a merchant's restock** (the wholesaler is paid when the goods arrive).

1. **Fund**: the funder splits a project into steps and pays a **Lightning invoice**. The money sits in escrow, counted per project.
2. **Prove**: the trusted person on site opens a private link (no account) and sends dated, geotagged photos, the invoice, and who is to be paid.
3. **Second opinion**: before deciding, the funder sees automatic checks (is this file already used elsewhere? was the phone in Senegal when it sent the proof, and are the photos recent? does the invoice match the step?) and, **on request, Claude's advice** on the photos and the invoice. The AI reads, plain code compares, the funder decides; it never blocks or triggers a payment.
4. **Release**: the supplier is paid **in sats at their Lightning address** (LNURL-pay); the receipt shows the **preimage**, the cryptographic proof of payment. Unused escrow can be refunded.
5. **Verify**: every event joins a hash-chained record, anchored on Bitcoin with OpenTimestamps and **published on Nostr relays** as a signed commitment that carries no name and no amount. The public verification page re-checks everything in the visitor's browser, relays included.

**With the people around the project.** The funder can name an **independent witness** (a neighbour, a mason) who looks at each proof from outside and says "confirmed" or "disputed", and can decide that **nothing is paid without that confirmation**. A **family link** lets relatives add to the escrow from any Lightning wallet (they cannot release or take anything back). **Notifications** on the phone (Web Push, no SMS) tell each person when something needs them. All three go through signed links, no account, and the witness's answer is written in the ledger.

A **"Quick trial"** button creates a 15 $ project in three steps so a visitor can see the whole path in a few minutes.

## What is real, and what is not

| Piece | Status (2 Nov. 2026) |
|---|---|
| Lightning funding over Nostr Wallet Connect (NIP-47); supplier payout to a Lightning address; refunds | Tested end to end against a **scripted wallet**, and the adapter against a **real NIP-47 wallet service** (Alby's SDK) on a simulated relay. **Not yet run with a real wallet and real sats.** |
| Mobile money payout (Bitnob) | Ran end to end in the **Bitnob sandbox**; not on the real-sats instance |
| Hash-chained record, browser-side verification, OpenTimestamps anchoring | **Real** (public calendars, downloadable `.ots` proof) |
| Nostr commitments (kind 8421), NIP-03 timestamps | Tested against fake relays; the verification page was checked in a browser against real relays in read-only. **Publishing to real relays not tried yet** (`frontend/scripts/nostr-smoke.mjs`) |
| AI advice on proofs | Tested with a fake client. **Never run against the real API yet** |
| Custody | The escrow is held by **the instance's own wallet** (a custodial design, bounded by pilot ceilings and a solvency check that pauses payments if what is owed exceeds what the wallets hold). It is not a licensed financial service |

Each instance says its mode at the top of every screen: **demonstration** (everything simulated), **Bitnob sandbox**, or **real bitcoin** (pilot ceilings).

## Run it

Needs **Node.js 22+**.

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

The app is in French by default and in English for browsers that ask for English (or from the language switch). The landing page is at `/` and `/en`. In demonstration mode, use "Try with the demo account" (SMS code `123456`).

- **Real sats** (a trial instance for a jury): `LIGHTNING_RAIL=nwc`, two NWC connections of different rights, pilot ceilings, guest accounts. See [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md) (in French) and [`frontend/.env.example`](frontend/.env.example) (commented, in English).
- **Tests**: `npm run typecheck && npm test` (700+ tests, no network and no key needed).

## Security notes

Two wallet connections with different rights (one can only make and look up invoices); every answer from a wallet or another server is checked before it is believed (an invoice must be for the amount asked, a payment counts only with a preimage that hashes to the invoice, a lost answer keeps the money reserved and the payment is looked up by hash, never repeated); an SSRF-safe client for user-typed Lightning addresses; privacy-minimal Nostr commitments and AI requests. Read [`SECURITY.md`](SECURITY.md) before exposing an instance publicly: the prototype has not been audited.

## Map of the repository

```
frontend/src/app/          pages and API routes (Next.js App Router)
frontend/src/server/       money rules: lightning/ (NWC, BOLT11, LNURL, SSRF guard), nostr/, aiReview.ts, ledger, OpenTimestamps
frontend/src/lib/          shared with the browser: types, templates, i18n, verification, Nostr relay client
frontend/tests/            Vitest (fake wallet, fake relays, fake AI client)
docs/                      audit and plan, changelog of this hackathon, deployment guide, Devpost draft
deploy/                    Docker Compose + Caddy + backup script
```

[`ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) · translations are welcome: the English wording lives in one file, [`frontend/src/lib/i18n/en.ts`](frontend/src/lib/i18n/en.ts), and a language is one more dictionary (Wolof help wanted: [`docs/TRADUIRE.md`](docs/TRADUIRE.md)).
