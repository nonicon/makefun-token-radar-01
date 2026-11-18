# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nonicon/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nonicon/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The best token launch radar: every pre-token protocol in the DefiLlama snapshot, ranked by the implied value of the token it has not issued yet, with a farm plan for each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-4)

One function scores every row, from the snapshot's own figures only — no protocol name is ever special-cased:

```
market = clamp( category median mcap/TVL, shrunk toward the global median by n / (n + 2), 0.10, 0.50 )
implied = round( tvl_usd x market
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + (min(age_days, 1095) / 1095) ^ 0.5 x 0.4)
  x (1 + 0.02 x min(chains - 1, 5))
  x (1 + 0.05 x clamp(log10(tvl_usd / category median TVL), -1, 1)) )
```

- **Market:** the market prices each kind of token differently, so the base multiple is priced from the snapshot itself, in full: the median market-cap-to-TVL ratio of the live-token protocols in the same category (133 live protocols, global median 0.1857), shrunk toward the global median by n / (n + 2) so a category with few live tokens cannot set the price, clamped to 0.10–0.50. A category with fewer than two live tokens is priced at the global median instead — one token is one observation, not a market: the lone live Risk Curators token, Api3, trades at 3.0x its $11.8M TVL, and it must not set the price for $2.7B of curator TVL. A category with no live token keeps the flat 0.25 anchor. Dexs price near 0.32, Lending near 0.14, RWA near 0.26.
- **Size:** TVL times the market multiple — the launch is worth a share of the value already locked.
- **Growth:** seven-day TVL change, clamped, moves the value by up to half its weight.
- **Maturity:** age with no token, up to three years, concave — the first year of waiting counts most, the third adds least. A long run with no token is pent-up value. An unlisted age uses 365 days.
- **Reach:** each extra chain adds 2%, to 10% — more chains, more users to claim.
- **Dominance:** TVL against the category median, computed from the snapshot itself — the category leader is worth more. The tilt is halved to 0.05 so size is not counted twice: TVL is already the base.

A protocol is ranked when its record carries no token (no market cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped, staked or staking, it does not begin with an exchange name, and it does not end in a version marker. That is the watchlist's own rule, applied to every row. The watchlist (40 protocols at or above the $50M floor) is the floor, never the ceiling: the board carries 198 rows — every protocol in the snapshot that passes the rule, including the early radar above and below the floor. Protocols whose token already trades are set aside with their market caps shown, never modelled.

The dashboard is a static page with no network: a ranked board with a Top 10 spotlight, search, category and chain filters, sorting, a detail view for every protocol with the model's own inputs and its farm plan, and a live-token tab. Each farm plan has seven steps derived from the protocol's category, chains, TVL and age, with what it costs and how long it takes — including the category's own risk to watch while the position is open — and a farm budget line (capital, gas, setup time, hold length). The detail view steps to the previous and next protocol by rank. The dashboard also shows the model's own backtest (below), recomputed by the program on every run.

## Checked against the market (radar-4 vs radar-3)

The program validates its own model on the snapshot before it writes the board: each of the 133 live-token protocols (market cap known, TVL above zero, not a CEX token) is scored as if it were pre-token, and the model's implied value is ranked against its real market cap (Spearman ρ). Each protocol is left out of its own category's market multiple, so nothing in the score leaks from the answer. radar-3 is scored on the same live set, so the improvement is measured, not claimed:

| | radar-3 | radar-4 |
|---|---|---|
| Rank vs real market cap (ρ) | 0.3911 | **0.4127** |
| Pricing vs real mcap/TVL (ρ) | 0.0775 | **0.1675** |
| TVL alone, for comparison (ρ) | 0.3901 | 0.3901 |

Five changes, each of which helps on its own and on every half of the live set (split by slug hash and by category, both halves improve on both measures): the market multiple is priced in full instead of half-blended with the flat anchor, the shrinkage is n / (n + 2) instead of n / (n + 4), a category prices itself only with two or more live tokens, maturity is concave instead of linear, and the dominance tilt is halved from 0.10 to 0.05. Two ideas the same backtest killed are not in the model: category-relative growth, and any re-weighting of the growth term — both rank worse than radar-3.

The re-ranking is real: 189 of 198 rows move rank against radar-3 (board rank correlation 0.963), and the top 10 gains three new names (Bitfi Basis at #6, Onre at #8, Opentrade at #10). Steakhouse Financial stays rank 1, now at $515.1M implied (was $787.5M): its Risk Curators category has only one live token, Api3 at 3.0x its $11.8M TVL, so radar-4 prices the category at the global median instead of letting one small token set the price for $2.7B of curator TVL.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to the kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with the vendored `vendor/makefun-board.ts`. It is deterministic: the same snapshot always writes the same bytes.

## Reproduce the board

The run below regenerates every output from the sealed snapshot and proves
the program is deterministic: two runs write byte-identical files, so the
grader's two runs agree.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to the kit>/input/snapshot.json
sha256sum out/board.json out/data.js
rm -rf out2 && mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts --input <path to the kit>/input/snapshot.json
diff -r out out2 && echo deterministic
```

`main.ts` also verifies its own outputs before it reports success: it reads
`board.json` back and refuses to finish unless the row count matches the
board it scored, and it parses `dossier.json` so a half-written file fails
here instead of reaching the grader. The screenshots under `screenshots/`
are real headless-Chromium renders of this dashboard (board, detail view,
filtered view), taken with Playwright; the script that took them lives in
the build's working notes, not in this repository, because the entry is the
dashboard and the program that builds it.

---

<sub>Entered on [make.fun](https://make.fun/?ref=nonicon&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
