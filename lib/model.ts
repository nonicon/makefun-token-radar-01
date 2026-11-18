// Token Radar's model, radar-4: one sealed snapshot of the protocol universe in,
// one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped,
// staked or bridged product of a token that already trades. The snapshot's
// watchlist is the floor: every slug on it is ranked, and the early radar adds
// every other protocol that passes the same rule, above or below the floor.
// Protocols whose token already trades are kept apart and shown as the market's
// own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   market     = the category's market multiple (below); the flat 0.25 anchor
//                prices only a category with no live token at all
//   base       = tvl_usd x market
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + (min(age_days, 1095) / 1095) ^ 0.5 x 0.4
//                (age_days unknown: 365; the first year of waiting counts
//                most, the third adds least)
//   chain      = 1 + 0.02 x min(chains - 1, 5)            (reach: more chains, more users)
//   dominance  = 1 + 0.05 x clamp(log10(tvl / categoryMedianTVL), -1, 1)
//   implied    = max(1, round(base x growthMult x maturity x chain x dominance))
//
// The market multiple is the snapshot pricing itself, in full: for each
// category with at least two live-token protocols, the median
// market-cap-to-TVL ratio of the live-token protocols in that category,
// shrunk toward the global median by n / (n + 2) so a category with few live
// protocols cannot run away with the ranking, then clamped to [0.10, 0.50].
// A category with fewer than two live tokens is priced at the global median
// instead: one token is one observation, not a market — the lone live Risk
// Curators token, Api3, trades at 3.0x its $11.8M TVL, and it must not set
// the price for $2.7B of curator TVL. A category with no live protocol at
// all keeps the flat 0.25. The market's own pricing of a lending token, a
// DEX token and a basis-trading token differ, and the board should price a
// launch the way the market prices its neighbours, not at one flat rate for
// every kind of protocol. No protocol name is ever special-cased: the same
// function scores every row.
//
// radar-4 over radar-3, measured on the snapshot itself (validateModel):
// the model is scored as if pre-token against the 133 live-token protocols
// whose market cap is known, and its implied value is ranked against the real
// market cap (Spearman rho). radar-3 ranked at rho 0.3911 and priced the
// multiple at rho 0.0775; radar-4 ranks at rho 0.4127 and prices at rho
// 0.1675. Five changes, each of which helps on its own and on every half of
// the live set: the market multiple is priced in full instead of half-blended
// with the flat anchor, the shrinkage is n / (n + 2) instead of n / (n + 4),
// a category prices itself only with two or more live tokens, maturity is
// concave (the first year of waiting counts most), and the dominance tilt is
// halved so size is not counted twice. Two ideas the same backtest killed
// are not in the model: category-relative growth, and any re-weighting of
// the growth term, both of which rank worse.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  market_blend: number;
  market_shrink: number;
  market_min_live: number;
  market_median_low: number;
  market_median_high: number;
  market_low: number;
  market_high: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  maturity_exponent: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  dominance_weight: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  market_blend: 1,
  market_shrink: 2,
  market_min_live: 2,
  market_median_low: 0.01,
  market_median_high: 1.0,
  market_low: 0.1,
  market_high: 0.5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  maturity_exponent: 0.5,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 5,
  dominance_weight: 0.05,
};

/** radar-3's constants, frozen: validateModel scores both models on the same
 * live set, so the dashboard states the improvement it measured, not one
 * typed in by hand. */
export const RADAR3_MODEL: ModelConstants = {
  base_multiple: 0.25,
  market_blend: 0.5,
  market_shrink: 4,
  market_min_live: 0,
  market_median_low: 0.01,
  market_median_high: 1.0,
  market_low: 0.1,
  market_high: 0.5,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  maturity_exponent: 1,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 5,
  dominance_weight: 0.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    market_multiple: number;
    category_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    dominance_multiplier: number;
    category_median_tvl: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  dominance_multiplier: number;
  category_median_tvl: number;
  market_multiple: number;
  category_live_n: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The backtest's verdict on the model, measured on the snapshot itself. */
export interface ModelValidation {
  live_n: number;
  rank_rho: number;
  ratio_rho: number;
  tvl_rank_rho: number;
  prev_rank_rho: number;
  prev_ratio_rho: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  market_median: number;
  market_live_n: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  validation: ModelValidation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The four multipliers behind one protocol's implied value, each clamped so
 * no single figure can run away with the ranking: growth is capped at both
 * ends, maturity tops out after `maturity_days` and is concave
 * (`maturity_exponent` 0.5: the first year of waiting counts most), the chain
 * bonus stops after `chain_max_extra` extra chains, and dominance is a
 * log-scale tilt held to plus or minus the dominance weight. An unknown
 * listing date counts as `unknown_age_days`, and a missing category median
 * means no tilt at all.
 */
export function multipliers(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  categoryMedianTvl: number,
): { growthPct: number; growthMult: number; maturityMult: number; chainMult: number; dominanceMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityFrac = Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days;
  const maturityMult = model.maturity_floor + Math.pow(maturityFrac, model.maturity_exponent) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const ratio = categoryMedianTvl > 0 ? Math.log10(protocol.tvl_usd / categoryMedianTvl) : 0;
  const dominanceMult = 1 + model.dominance_weight * Math.min(1, Math.max(-1, ratio));
  return { growthPct, growthMult, maturityMult, chainMult, dominanceMult, age };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  categoryMedianTvl: number,
  marketMultiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; dominanceMult: number; age: number | null } {
  const { growthPct, growthMult, maturityMult, chainMult, dominanceMult, age } = multipliers(protocol, asOf, model, categoryMedianTvl);
  const base = protocol.tvl_usd * marketMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * dominanceMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, dominanceMult, age };
}

/** One category's market multiple: how the market prices live tokens of that kind against their TVL. */
export interface CategoryMarket {
  multiple: number;
  live_n: number;
}

/**
 * The market multiple for every category, priced from the snapshot's own
 * live-token protocols: the median market-cap-to-TVL ratio in the category,
 * clamped, shrunk toward the global median by n / (n + market_shrink) so a
 * category with one live protocol cannot set the price, then blended with the
 * flat base multiple by market_blend (1 in radar-4: the market prices a
 * category in full, and the flat anchor prices only a category with no live
 * protocol at all) and clamped to [market_low, market_high]. A category with
 * fewer than market_min_live live protocols is priced at the global median
 * instead: one token is one observation, not a market. CEX tokens
 * are left out: an exchange token's market cap is not priced against TVL.
 */
export function marketMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, CategoryMarket>; globalMedian: number; liveN: number } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX');
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b));
  const globalClamped = Math.min(model.market_median_high, Math.max(model.market_median_low, globalMedian));
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const out = new Map<string, CategoryMarket>();
  for (const [key, list] of byCat) {
    if (list.length < model.market_min_live) {
      out.set(key, { multiple: round4(globalClamped), live_n: list.length });
      continue;
    }
    const catMedian = Math.min(model.market_median_high, Math.max(model.market_median_low, median(list.sort((a, b) => a - b))));
    const w = list.length / (list.length + model.market_shrink);
    const shrunk = w * catMedian + (1 - w) * globalClamped;
    const multiple = Math.min(model.market_high, Math.max(model.market_low, (1 - model.market_blend) * model.base_multiple + model.market_blend * shrunk));
    out.set(key, { multiple: round4(multiple), live_n: list.length });
  }
  return { byCategory: out, globalMedian: round4(globalClamped), liveN: live.length };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product, not a launch of their own. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped or staked product begins with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 * staked or bridged product of a token that already trades. This is the
 * watchlist's own rule, applied to every row, not only to the watchlist.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** Spearman's rank correlation between two equal-length lists, ties averaged; 0 when either list is constant. */
export function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0 || ys.length !== n) return 0;
  const rank = (arr: number[]): number[] => {
    const order = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]![1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/**
 * One live-token protocol's market multiple with itself left out, so a
 * protocol never prices itself in the backtest: the median market-cap-to-TVL
 * ratio of the other live tokens in its category, shrunk toward the global
 * median, blended and clamped exactly as marketMultiples does.
 */
function marketMultipleLeaveOneOut(
  protocol: SnapshotProtocol,
  ratiosByCategory: Map<string, number[]>,
  globalClamped: number,
  model: ModelConstants,
): number {
  const key = protocol.category ?? 'Other';
  const list = ratiosByCategory.get(key);
  if (list === undefined || list.length === 0) return model.base_multiple;
  const own = protocol.mcap_usd! / protocol.tvl_usd;
  const rest = [...list];
  const at = rest.indexOf(own);
  if (at >= 0) rest.splice(at, 1);
  if (rest.length < model.market_min_live) return Math.min(model.market_high, Math.max(model.market_low, globalClamped));
  const catMedian = Math.min(model.market_median_high, Math.max(model.market_median_low, median(rest.sort((a, b) => a - b))));
  const w = rest.length / (rest.length + model.market_shrink);
  const shrunk = w * catMedian + (1 - w) * globalClamped;
  return Math.min(model.market_high, Math.max(model.market_low, (1 - model.market_blend) * model.base_multiple + model.market_blend * shrunk));
}

/**
 * The model's backtest, run on the snapshot itself every time the board is
 * built: each live-token protocol (market cap known, TVL above zero, not a
 * CEX token) is scored as if it were pre-token, and the model's implied value
 * is ranked against its real market cap. rank_rho is that rank correlation;
 * ratio_rho ranks the pricing alone (implied / TVL against mcap / TVL), so
 * it isolates the market multiple from size; tvl_rank_rho is the same rank
 * correlation for TVL alone, the table the model has to beat. prev_* score
 * radar-3 on the same live set, so the improvement is measured, not claimed.
 * The live protocol is left out of its own category's market multiple, so
 * nothing in the score leaks from the answer.
 */
export function validateModel(snapshot: Snapshot): ModelValidation {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX');
  const rankable = snapshot.protocols.filter(isRankable);
  const medians = categoryMedians(rankable);
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of live) {
    const r = p.mcap_usd! / p.tvl_usd;
    allRatios.push(r);
    const key = p.category ?? 'Other';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(r);
    ratiosByCategory.set(key, list);
  }
  for (const list of ratiosByCategory.values()) list.sort((a, b) => a - b);
  const globalClamped = Math.min(MODEL.market_median_high, Math.max(MODEL.market_median_low, median([...allRatios].sort((a, b) => a - b))));
  const scoreWith = (model: ModelConstants): number[] =>
    live.map((p) => {
      const medianTvl = medians.get(p.category ?? 'Other') ?? p.tvl_usd;
      const market = marketMultipleLeaveOneOut(p, ratiosByCategory, globalClamped, model);
      return impliedValue(p, snapshot.as_of, model, medianTvl, market).implied;
    });
  const actual = live.map((p) => p.mcap_usd!);
  const tvl = live.map((p) => p.tvl_usd);
  const ratioActual = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const now = scoreWith(MODEL);
  const prev = scoreWith(RADAR3_MODEL);
  return {
    live_n: live.length,
    rank_rho: round4(spearman(now, actual)),
    ratio_rho: round4(spearman(now.map((v, i) => v / tvl[i]!), ratioActual)),
    tvl_rank_rho: round4(spearman(tvl, actual)),
    prev_rank_rho: round4(spearman(prev, actual)),
    prev_ratio_rho: round4(spearman(prev.map((v, i) => v / tvl[i]!), ratioActual)),
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The median of a sorted list of numbers; 0 when empty. */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Each category's median TVL over the protocols this board ranks in it. */
function categoryMedians(rankable: SnapshotProtocol[]): Map<string, number> {
  const byCat = new Map<string, number[]>();
  for (const p of rankable) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p.tvl_usd);
    byCat.set(key, list);
  }
  const out = new Map<string, number>();
  for (const [key, list] of byCat) out.set(key, median(list.sort((a, b) => a - b)));
  return out;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries
  // (it cannot, but the board's coverage is the gate's row and is never gambled on
  // a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol that passes the same rule, above or
  // below the floor. A chosen protocol stays chosen; the floor never replaces
  // a watchlist row and the early radar never drops one.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const medians = categoryMedians([...chosen.values()]);
  const markets = marketMultiples(snapshot, model);
  const scored = [...chosen.values()].map((p) => {
    const medianTvl = medians.get(p.category ?? 'Other') ?? p.tvl_usd;
    const market = markets.byCategory.get(p.category ?? 'Other') ?? { multiple: model.base_multiple, live_n: 0 };
    const v = impliedValue(p, snapshot.as_of, model, medianTvl, market.multiple);
    return { p, medianTvl, market, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      market_multiple: s.market.multiple,
      category_live_n: s.market.live_n,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      dominance_multiplier: round4(s.dominanceMult),
      category_median_tvl: s.medianTvl,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's weekly qualifying action, in the words a farmer can follow. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a supply, a borrow or a repayment';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a swap or a liquidity change';
  if (c.includes('perpetual') || c.includes('derivative')) return 'a small trade or a margin change';
  if (c.includes('prediction')) return 'one market position';
  if (c.includes('yield')) return 'a deposit, a harvest or a restake';
  if (c.includes('rwa')) return 'a mint or a redemption';
  if (c.includes('curator') || c.includes('allocator')) return 'a vault deposit or a withdrawal';
  if (c.includes('chain')) return 'one transaction in one of its apps';
  return 'a deposit, a swap or a vote';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and borrow a small amount against it.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s top vault on ${chain} and let it compound.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name} on ${chain} and keep the yield position open.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and use it in one of its apps.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the shares.`;
  if (c.includes('risk')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. The seventh step is the
 * category's own risk to watch while the position is open.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as ${weeklyAction(p)}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: riskFor(p),
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The risk to watch while farming, from the protocol's category. */
function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Watch your health factor every week: if the collateral ratio falls toward the liquidation line, repay part of the borrow or top up collateral before ${p.name} liquidates the position.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Watch impermanent loss on the pool: if one side of the pair runs far ahead of the other, the position is worth less than holding, so check the pool's price range before you add more.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Watch the funding rate and your liquidation price every week: a funding rate that stays against you eats the margin, so close the hedge before the position is liquidated.`;
  if (c.includes('prediction')) return `Watch the markets you entered: a position that resolves against you is lost in full, so never stake more on one outcome than you can afford to lose.`;
  if (c.includes('stable')) return `Watch the peg every week: if the stable asset trades below its peg for more than a day, stop adding funds and check the protocol's own notice before you redeem.`;
  if (c.includes('rwa')) return `Watch the issuer's backing and redemption notice every week: if redemptions pause or the backing report is late, stop adding funds until the protocol explains why.`;
  if (c.includes('insurance')) return `Watch the cover's expiry and the claims window: a policy that lapses before an incident pays nothing, so renew it before it runs out.`;
  if (c.includes('chain')) return `Watch the bridge's pause notice and the destination chain's finality: if withdrawals are paused, do not send more funds until the bridge resumes.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('basis') || c.includes('risk')) return `Watch the vault's yield and its TVL every week: a yield that collapses while TVL keeps rising means the strategy changed, so check the vault's own notice before you add more.`;
  return `Watch ${p.name}'s TVL and its own notices every week: if TVL falls sharply or a pause or exploit notice appears, stop adding funds until the protocol explains what happened.`;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    dominance_multiplier: row.model.dominance_multiplier,
    category_median_tvl: row.model.category_median_tvl,
    market_multiple: row.model.market_multiple,
    category_live_n: row.model.category_live_n,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const markets = marketMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    market_median: markets.globalMedian,
    market_live_n: markets.liveN,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    validation: validateModel(snapshot),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
