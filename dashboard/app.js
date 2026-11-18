// Token Radar's dashboard, radar-4. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's farm
// plan, and the live-token set the board keeps apart. No network: every byte
// it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. radar-4 prices the base
  // with the category's market multiple in full (median market-cap-to-TVL of the
  // live tokens in that category, shrunk toward the global median; the flat
  // 0.25 anchor prices only a category with no live token), then growth,
  // concave maturity, chain breadth and dominance
  // inside the protocol's own category, whose median TVL the model computes
  // from the snapshot itself.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var exp = model.maturity_exponent === null || model.maturity_exponent === undefined ? 1 : model.maturity_exponent;
    var maturity = model.maturity_floor + Math.pow(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days, exp) * model.maturity_range;
    var chain = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_extra);
    var median = row.category_median_tvl > 0 ? row.category_median_tvl : row.tvl_usd;
    var ratio = Math.log10(row.tvl_usd / median);
    var dominance = 1 + model.dominance_weight * Math.min(1, Math.max(-1, ratio));
    var market = row.market_multiple === null || row.market_multiple === undefined ? model.base_multiple : row.market_multiple;
    return Math.max(1, Math.round(row.tvl_usd * market * growthMult * maturity * chain * dominance));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function weeklyAction(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply, a borrow or a repayment';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'a swap or a liquidity change';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'a small trade or a margin change';
    if (c.indexOf('prediction') >= 0) return 'one market position';
    if (c.indexOf('yield') >= 0) return 'a deposit, a harvest or a restake';
    if (c.indexOf('rwa') >= 0) return 'a mint or a redemption';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'a vault deposit or a withdrawal';
    if (c.indexOf('chain') >= 0) return 'one transaction in one of its apps';
    return 'a deposit, a swap or a vote';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s top vault on " + chain + ' and let it compound.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and keep the yield position open.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + ' and use it in one of its apps.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s basis vault on " + chain + ' and keep the shares.';
    if (c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Watch your health factor every week: if the collateral ratio falls toward the liquidation line, repay part of the borrow or top up collateral before ' + p.name + ' liquidates the position.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return "Watch impermanent loss on the pool: if one side of the pair runs far ahead of the other, the position is worth less than holding, so check the pool's price range before you add more.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Watch the funding rate and your liquidation price every week: a funding rate that stays against you eats the margin, so close the hedge before the position is liquidated.';
    if (c.indexOf('prediction') >= 0) return 'Watch the markets you entered: a position that resolves against you is lost in full, so never stake more on one outcome than you can afford to lose.';
    if (c.indexOf('stable') >= 0) return "Watch the peg every week: if the stable asset trades below its peg for more than a day, stop adding funds and check the protocol's own notice before you redeem.";
    if (c.indexOf('rwa') >= 0) return "Watch the issuer's backing and redemption notice every week: if redemptions pause or the backing report is late, stop adding funds until the protocol explains why.";
    if (c.indexOf('insurance') >= 0) return "Watch the cover's expiry and the claims window: a policy that lapses before an incident pays nothing, so renew it before it runs out.";
    if (c.indexOf('chain') >= 0) return "Watch the bridge's pause notice and the destination chain's finality: if withdrawals are paused, do not send more funds until the bridge resumes.";
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('risk') >= 0) return "Watch the vault's yield and its TVL every week: a yield that collapses while TVL keeps rising means the strategy changed, so check the vault's own notice before you add more.";
    return "Watch " + p.name + "'s TVL and its own notices every week: if TVL falls sharply or a pause or exploit notice appears, stop adding funds until the protocol explains what happened.";
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as ' + weeklyAction(p) + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: riskFor(p), cost: 'no fee to check', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { text: 'Token Radar' }),
        el('small', { text: 'pre-token protocols, ranked' })
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill' }, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'pill' }, 'DefiLlama protocol index'),
        el('span', { class: 'pill' }, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds every other protocol that passes the same rule, above or below the floor, and leaves out the wrapped, staked and bridged products of tokens that already trade. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist protocol is on the board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: 'ranked by implied value' })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the floor' }), el('b', { text: String(DATA.early_size) }), el('small', { text: 'found below and above the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market cap, never modelled' }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 10);
    var max = top[0] ? top[0].implied_value_usd : 1;
    return el('section', { class: 'spot', 'aria-label': 'Top 10' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('p', { class: 'sub', text: 'The strongest launches on the board. Select one for its model and farm plan.' }),
      el('div', { class: 'cards' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: '#' + r.rank }),
          el('b', { text: r.name }),
          el('span', { class: 'cat', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' }),
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'implied' || key === 'tvl' || key === 'growth' || key === 'age' ? 'num' : '' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x market multiple\n' +
        '  x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')\n' +
        '  x (' + m.maturity_floor + ' + (min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ')^' + m.maturity_exponent + ' x ' + m.maturity_range + ')\n' +
        '  x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_max_extra + '))\n' +
        '  x (1 + ' + m.dominance_weight + ' x clamp(log10(tvl_usd / category median TVL), -1, 1)) )\n' +
        'market multiple: the category median market-cap/TVL of its live tokens, shrunk toward the global median ' + DATA.market_median + ' over ' + DATA.market_live_n + ' live protocols (n / (n + ' + m.market_shrink + ')), clamped to ' + m.market_low + '–' + m.market_high + '; a category with fewer than ' + m.market_min_live + ' live tokens uses the global median, and one with no live token keeps the flat ' + m.base_multiple + ' anchor'
      ),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: 'Market' }), el('span', { text: 'The market prices each kind of token differently: the base multiple comes from the live tokens in the same category, priced in full — the flat anchor only covers a category with no live token at all.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Size' }), el('span', { text: 'TVL times the market multiple: the launch is worth a share of the value already locked.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Growth' }), el('span', { text: 'Seven-day TVL change, clamped, moves the value by up to half its weight.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Maturity' }), el('span', { text: 'Age with no token, up to three years, concave: the first year of waiting counts most, the third adds least — a long run with no token is pent-up value.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Reach' }), el('span', { text: 'Each extra chain adds 2%, to 10%: more chains, more users to claim.' })),
        el('div', { class: 'factor' }, el('b', { text: 'Dominance' }), el('span', { text: 'TVL against the category median, from the snapshot itself: the category leader is worth more.' }))
      ),
      el('p', { class: 'sub', text: 'TVL, seven-day growth and age come from the snapshot. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days + ' days. Wrapped, staked and bridged products are left out of the board entirely, because their token already trades under another name.' })
    );
  }


  function validationPanel() {
    var v = DATA.validation;
    if (!v) return null;
    return el('section', { class: 'panel' },
      el('h2', { text: 'Checked against the market' }),
      el('p', { class: 'sub', text: 'The model is scored as if pre-token against the ' + v.live_n + ' protocols in this snapshot whose token already trades, and its implied value is ranked against their real market caps. The program runs this check itself on every run, leaving each protocol out of its own category price, so nothing in the score leaks from the answer.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Live protocols checked' }), el('b', { text: String(v.live_n) }), el('small', { text: 'every live-token protocol with TVL above zero' })),
        el('div', { class: 'fact' }, el('span', { text: 'Rank vs real market cap' }), el('b', { text: 'ρ ' + v.rank_rho.toFixed(2) }), el('small', { text: 'radar-3 measured ' + v.prev_rank_rho.toFixed(2) + ' on the same set' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pricing vs real mcap/TVL' }), el('b', { text: 'ρ ' + v.ratio_rho.toFixed(2) }), el('small', { text: 'radar-3 measured ' + v.prev_ratio_rho.toFixed(2) + ' — the multiple, not size' })),
        el('div', { class: 'fact' }, el('span', { text: 'TVL alone, for comparison' }), el('b', { text: 'ρ ' + v.tvl_rank_rho.toFixed(2) }), el('small', { text: 'the table the model has to beat' }))
      )
    );
  }

  function methodPanel() {
    return el('section', { class: 'panel' },
      el('h2', { text: 'How the board is built' }),
      el('p', { class: 'note', text: 'The snapshot is the DefiLlama protocol index as fetched on ' + DATA.as_of + ', ' + DATA.rows.length + ' protocols scored from ' + DATA.watchlist_size + ' on the watchlist plus the early radar. A protocol is ranked when its record carries no token (no market cap, no CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped, staked or staking, it does not begin with an exchange name, and it does not end in a version marker. The market multiple is priced from the same snapshot: the median market-cap-to-TVL ratio of the ' + DATA.market_live_n + ' live-token protocols, per category with at least two live tokens, priced in full and shrunk toward the global median of ' + DATA.market_median + ' by n / (n + 2); a category with fewer than two live tokens uses the global median, because one token is one observation, not a market; a category with no live token keeps the flat 0.25 anchor.' }),
      el('p', { class: 'note', text: 'Say a protocol records no token, never that it has none: a protocol on the list may still hold a token its DefiLlama record does not carry. The board does not predict whether or when a token is issued. An implied value is the entry\u2019s own claim from the snapshot\u2019s figures, never a price.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var check = impliedOf(row, DATA.model);
    var minLive = DATA.model.market_min_live === null || DATA.model.market_min_live === undefined ? 2 : DATA.model.market_min_live;
    var marketNote = row.category_live_n >= minLive
      ? 'Priced from the ' + row.category_live_n + ' live ' + (row.category || 'Other') + ' tokens in this snapshot (median market-cap/TVL, shrunk toward the global ' + DATA.market_median + ').'
      : row.category_live_n > 0
        ? 'Only ' + row.category_live_n + ' live ' + (row.category || 'Other') + ' token' + (row.category_live_n === 1 ? '' : 's') + ' in this snapshot, so the category is priced at the global median ' + DATA.market_median + ' instead of one token\u2019s ratio.'
        : 'No live ' + (row.category || 'Other') + ' token in this snapshot, so the flat ' + DATA.model.base_multiple + ' anchor prices it.';
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var prev = row.rank > 1 ? DATA.rows[row.rank - 2] : null;
    var next = row.rank < DATA.rows.length ? DATA.rows[row.rank] : null;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('div', { class: 'detail-actions' },
        el('button', { class: 'close nav', type: 'button', disabled: prev ? null : 'disabled', 'aria-label': 'Previous protocol', text: '← Prev', onclick: function () { if (prev) openDetail(prev.slug); } }),
        el('button', { class: 'close nav', type: 'button', disabled: next ? null : 'disabled', 'aria-label': 'Next protocol', text: 'Next →', onclick: function () { if (next) openDetail(next.slug); } }),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Market multiple' }), el('b', { class: 'num', text: String(row.market_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Dominance multiplier' }), el('b', { class: 'num', text: String(row.dominance_multiplier) })),
        el('div', null, el('span', { text: 'Category median TVL' }), el('b', { class: 'num', text: fmtUsd(row.category_median_tvl) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub verify', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' ' + marketNote + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub budget', text: 'Farm budget: $' + capital + ' of capital, about $' + (capital >= 150 ? 10 : 6) + ' of gas to set up, 15 minutes, then a ' + hold + '-day hold with one action a week.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') { var val = validationPanel(); if (val) shell.appendChild(val); }
    shell.appendChild(methodPanel());
    shell.appendChild(el('footer', { text: 'Source: ' + DATA.source + '. Implied values are a model built from that snapshot alone, not a prediction of a launch or a price. Farm plans are general guidance: check the protocol\u2019s own pages before you move funds, and never pay to claim an airdrop.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
