/* Research-pass renderer (research_data.json). Aggregates only; no strategy
   parameters. Charts are inline SVG with a shared hover tooltip; every chart
   has a table or a direct-label fallback so identity is never colour-alone.
   Palette: validated (dataviz six checks) against the dark surface #15151f. */
(function () {
  const S = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
  const MUTED = '#5a606e', GRID = '#21212e', AXIS = '#2d2d3e', NEG = '#ff6b78', POS = '#23c08a';
  const el = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt = (v, d = 2) => v == null ? '—' : Number(v).toFixed(d);
  const money = (v, d = 2) => v == null ? '—' : (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(d);
  const sgn = (v, d = 2, u = '') => v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + u;
  const cls = v => v == null ? 'na' : (v >= 0 ? 'pos' : 'neg');

  // ---------------------------------------------------------------- tooltip
  const tip = document.createElement('div');
  tip.className = 'viz-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip);
  function bindTips(root) {
    root.querySelectorAll('[data-tip]').forEach(n => {
      n.addEventListener('mousemove', e => {
        tip.innerHTML = n.getAttribute('data-tip'); tip.style.display = 'block';
        const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      });
      n.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  // ---------------------------------------------------------------- scales
  const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) * (r1 - r0) / ((d1 - d0) || 1);
  function nice(lo, hi, n = 4) {
    const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
    for (let v = a; v <= b + step / 2; v += step) t.push(+v.toFixed(10));
    return t;
  }
  const dnum = s => Date.parse(s + 'T00:00:00Z');

  function frame(w, h, m) {
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img">`;
  }
  function yAxis(ticks, y, x0, x1, f) {
    return ticks.map(t => `<line class="grid-line" x1="${x0}" x2="${x1}" y1="${y(t)}" y2="${y(t)}"/>` +
      `<text x="${x0 - 6}" y="${y(t) + 3}" text-anchor="end">${f(t)}</text>`).join('');
  }
  function legend(items) {
    return '<div class="viz-legend">' + items.map(([c, l, dash]) =>
      `<span><i style="background:${dash ? 'transparent' : c};border-color:${c}${dash ? ';border-style:dashed' : ''}"></i>${esc(l)}</span>`).join('') + '</div>';
  }

  // ---------------------------------------------------------------- charts
  function dumbbell(host, rows) {
    // research OOF margin vs prospective forward margin (pp), with forward CI
    const W = 1000, rowH = 34, M = { l: 120, r: 24, t: 16, b: 30 }, H = M.t + M.b + rowH * rows.length;
    const vals = rows.flatMap(r => [r.oof, r.fwd, r.lo, r.hi]).filter(v => v != null);
    const ticks = nice(Math.min(0, ...vals), Math.max(0, ...vals), 5);
    const x = lin(ticks[0], ticks[ticks.length - 1], M.l, W - M.r);
    let s = frame(W, H);
    ticks.forEach(t => { s += `<line class="grid-line" x1="${x(t)}" x2="${x(t)}" y1="${M.t}" y2="${H - M.b}"/>` +
      `<text x="${x(t)}" y="${H - M.b + 14}" text-anchor="middle">${t > 0 ? '+' : ''}${t}</text>`; });
    s += `<line x1="${x(0)}" x2="${x(0)}" y1="${M.t}" y2="${H - M.b}" stroke="${AXIS}" stroke-width="1.5"/>`;
    rows.forEach((r, i) => {
      const y = M.t + rowH * (i + .5);
      s += `<text x="${M.l - 10}" y="${y + 3}" text-anchor="end" style="fill:var(--txt)">${esc(r.label)}</text>`;
      if (r.lo != null) s += `<line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y}" y2="${y}" stroke="${S[0]}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
      s += `<line x1="${x(r.oof)}" x2="${x(r.fwd)}" y1="${y}" y2="${y}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="2 3"/>`;
      s += `<circle cx="${x(r.oof)}" cy="${y}" r="5" fill="${MUTED}" stroke="#15151f" stroke-width="2" data-tip="<b>${esc(r.label)}</b><br>Research OOF margin ${sgn(r.oof, 2, ' pp')}"/>`;
      s += `<circle cx="${x(r.fwd)}" cy="${y}" r="5.5" fill="${S[0]}" stroke="#15151f" stroke-width="2" data-tip="<b>${esc(r.label)}</b><br>Forward margin ${sgn(r.fwd, 2, ' pp')}<br>95% day-bootstrap CI [${sgn(r.lo, 2)}, ${sgn(r.hi, 2)}] pp<br>${r.n.toLocaleString()} trades"/>`;
    });
    s += `<text x="${(M.l + W - M.r) / 2}" y="${H - 2}" text-anchor="middle">win rate minus break-even w* (percentage points)</text></svg>`;
    host.innerHTML = legend([[MUTED, 'Research out-of-fold (historical)'], [S[0], 'Prospective paper forward · 95% CI']]) + s;
    bindTips(host);
  }

  function equityPanel(host, e, color) {
    const W = 340, H = 170, M = { l: 44, r: 10, t: 12, b: 22 };
    const pts = [...e.oof.map(p => [dnum(p[0]), p[1]]), ...e.forward.map(p => [dnum(p[0]), p[1]])];
    if (!pts.length) { host.innerHTML = '<div class="chart-empty">no data</div>'; return; }
    const dd = e.forward.map(p => p[2]);
    const ys = [...pts.map(p => p[1]), ...dd, 0];
    const yt = nice(Math.min(...ys), Math.max(...ys), 3);
    const xs = pts.map(p => p[0]);
    const x = lin(Math.min(...xs), Math.max(...xs), M.l, W - M.r), y = lin(yt[0], yt[yt.length - 1], H - M.b, M.t);
    let s = frame(W, H) + yAxis(yt, y, M.l, W - M.r, t => (t > 0 ? '+' : '') + Math.round(t));
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="${AXIS}"/>`;
    if (e.forward.length) {
      const f0 = x(dnum(e.forward[0][0]));
      s += `<rect x="${f0}" y="${M.t}" width="${W - M.r - f0}" height="${H - M.b - M.t}" fill="${color}" opacity=".05"/>`;
      // drawdown wash (forward only)
      const area = e.forward.map(p => `${x(dnum(p[0]))},${y(p[2])}`).join(' ');
      s += `<polygon points="${x(dnum(e.forward[0][0]))},${y(0)} ${area} ${x(dnum(e.forward[e.forward.length - 1][0]))},${y(0)}" fill="${NEG}" opacity=".14"/>`;
      s += `<text x="${f0 + 4}" y="${M.t + 9}" style="font-size:9px">forward</text>`;
    }
    if (e.oof.length) {
      s += `<polyline fill="none" stroke="${MUTED}" stroke-width="2" stroke-linejoin="round" points="${e.oof.map(p => `${x(dnum(p[0]))},${y(p[1])}`).join(' ')}"/>`;
      s += `<text x="${M.l + 4}" y="${M.t + 9}" style="font-size:9px">historical OOF</text>`;
    }
    if (e.forward.length) {
      s += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${e.forward.map(p => `${x(dnum(p[0]))},${y(p[1])}`).join(' ')}"/>`;
      const last = e.forward[e.forward.length - 1];
      s += `<circle cx="${x(dnum(last[0]))}" cy="${y(last[1])}" r="4" fill="${color}" stroke="#15151f" stroke-width="2"/>`;
    }
    // hover hit-strips (one per day)
    const all = [...e.oof.map(p => ['OOF', ...p]), ...e.forward.map(p => ['Forward', ...p])];
    all.forEach((p, i) => {
      const cx = x(dnum(p[1])), nx = i + 1 < all.length ? x(dnum(all[i + 1][1])) : cx + 4;
      s += `<rect x="${cx - 2}" y="${M.t}" width="${Math.max(4, nx - cx)}" height="${H - M.b - M.t}" fill="transparent" data-tip="<b>${esc(e.code)} ${e.asset}</b> · ${p[0]}<br>${p[1]}<br>cumulative ${money(p[2])}${p[3] != null ? '<br>drawdown ' + money(p[3]) : ''}"/>`;
    });
    const d0 = new Date(Math.min(...xs)).toISOString().slice(5, 10), d1 = new Date(Math.max(...xs)).toISOString().slice(5, 10);
    s += `<text x="${M.l}" y="${H - 6}">${d0}</text><text x="${W - M.r}" y="${H - 6}" text-anchor="end">${d1}</text></svg>`;
    host.innerHTML = s; bindTips(host);
  }

  function linesChart(host, series, opts) {
    // series: [{label,color,pts:[[x,y,lo,hi]],dash}]
    const W = opts.w || 640, H = opts.h || 240, M = { l: 52, r: 26, t: 14, b: 34 };
    const xv = series.flatMap(s => s.pts.map(p => p[0]));
    const yv = series.flatMap(s => s.pts.flatMap(p => [p[1], p[2], p[3]])).filter(v => v != null);
    if (opts.yref != null) yv.push(opts.yref);
    const yt = nice(Math.min(opts.ymin ?? Infinity, ...yv), Math.max(opts.ymax ?? -Infinity, ...yv), 4);
    const xmap = opts.xcat ? (v => opts.xcat.indexOf(v)) : (v => v);
    const xs = xv.map(xmap);
    const x = lin(Math.min(...xs), Math.max(...xs), M.l, W - M.r), y = lin(yt[0], yt[yt.length - 1], H - M.b, M.t);
    let s = frame(W, H) + yAxis(yt, y, M.l, W - M.r, opts.yfmt || (t => t));
    if (opts.yref != null) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(opts.yref)}" y2="${y(opts.yref)}" stroke="${AXIS}" stroke-width="1.5"/>`;
    (opts.xticks || []).forEach(t => { s += `<text x="${x(xmap(t))}" y="${H - M.b + 14}" text-anchor="middle">${opts.xlab ? opts.xlab(t) : t}</text>`; });
    if (opts.diag) s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="${AXIS}" stroke-width="1.5"/>`;
    series.forEach(sr => {
      const band = sr.pts.filter(p => p[2] != null && p[3] != null);
      if (band.length > 1) s += `<polygon fill="${sr.color}" opacity=".12" points="${band.map(p => `${x(xmap(p[0]))},${y(p[3])}`).join(' ')} ${band.slice().reverse().map(p => `${x(xmap(p[0]))},${y(p[2])}`).join(' ')}"/>`;
      s += `<polyline fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${sr.dash ? ' stroke-dasharray="5 4"' : ''} points="${sr.pts.map(p => `${x(xmap(p[0]))},${y(p[1])}`).join(' ')}"/>`;
      sr.pts.forEach(p => {
        s += `<circle cx="${x(xmap(p[0]))}" cy="${y(p[1])}" r="4" fill="${sr.color}" stroke="#15151f" stroke-width="2"/>` +
          `<circle cx="${x(xmap(p[0]))}" cy="${y(p[1])}" r="11" fill="transparent" data-tip="<b>${esc(sr.label)}</b><br>${opts.tipx ? opts.tipx(p[0]) : p[0]}: ${opts.tipy ? opts.tipy(p[1]) : p[1]}${p[2] != null ? `<br>95% CI [${opts.tipy ? opts.tipy(p[2]) : p[2]}, ${opts.tipy ? opts.tipy(p[3]) : p[3]}]` : ''}${p[4] != null ? '<br>n = ' + p[4].toLocaleString() : ''}"/>`;
      });
    });
    if (opts.xtitle) s += `<text x="${(M.l + W - M.r) / 2}" y="${H - 2}" text-anchor="middle">${esc(opts.xtitle)}</text>`;
    s += '</svg>';
    host.innerHTML = legend(series.map(sr => [sr.color, sr.label, sr.dash])) + s; bindTips(host);
  }

  function groupedBars(host, cats, series, opts) {
    const W = opts.w || 640, H = opts.h || 230, M = { l: 52, r: 12, t: 14, b: 40 };
    const vals = series.flatMap(s => s.vals).filter(v => v != null);
    const yt = nice(Math.min(0, ...vals), Math.max(0, ...vals), 4);
    const y = lin(yt[0], yt[yt.length - 1], H - M.b, M.t);
    const band = (W - M.l - M.r) / cats.length, bw = Math.min(24, (band - 8) / series.length - 2);
    let s = frame(W, H) + yAxis(yt, y, M.l, W - M.r, opts.yfmt || (t => t));
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="${AXIS}" stroke-width="1.5"/>`;
    cats.forEach((c, i) => {
      const cx = M.l + band * (i + .5), x0 = cx - (series.length * (bw + 2) - 2) / 2;
      series.forEach((sr, j) => {
        const v = sr.vals[i]; if (v == null) return;
        const x = x0 + j * (bw + 2), y0 = y(0), y1 = y(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
        const r = Math.min(4, h / 2, bw / 2);
        // rounded data-end, square at the baseline
        const path = v >= 0
          ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
          : `M${x},${y0} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + bw - r} Q${x + bw},${top + h} ${x + bw},${top + h - r} V${y0} Z`;
        s += `<path d="${path}" fill="${sr.color}" data-tip="<b>${esc(c)}</b><br>${esc(sr.label)}: ${opts.tipy ? opts.tipy(v) : v}"/>`;
      });
      s += `<text x="${cx}" y="${H - M.b + 14}" text-anchor="middle">${esc(c)}</text>`;
    });
    if (opts.xtitle) s += `<text x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(opts.xtitle)}</text>`;
    s += '</svg>';
    host.innerHTML = legend(series.map(sr => [sr.color, sr.label])) + s; bindTips(host);
  }

  function table(host, head, body) {
    host.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
      body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
  }

  // ---------------------------------------------------------------- render
  fetch('research_data.json').then(r => r.json()).then(R => {
    const F = R.forward, P = F.pooled, MW = R.market_wide, C = R.calibration;
    el('rs-forward-cutoff') && (el('rs-forward-cutoff').textContent = (R.forward_data_cutoff_utc || '').slice(0, 16).replace('T', ' ') + ' UTC');
    const setT = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    setT('hd-specs-all', '≈' + Math.round(R.scale.program_specs_total_approx / 1000) + 'k');
    setT('hd-fwd-trades', R.scale.forward_trades.toLocaleString());
    setT('hd-fwd-cands', R.scale.forward_candidates);
    if (MW) {
      const pr = Object.values(MW.assets).reduce((a, b) => a + (b.kalshi_prints || 0), 0);
      const ct = Object.values(MW.assets).reduce((a, b) => a + (b.contracts_analysed || 0), 0);
      setT('hd-prints', (pr / 1e6).toFixed(1) + 'M');
      setT('hd-prints-k', `Kalshi prints · ${ct.toLocaleString()} contracts (public sample)`);
    }

    // ---- findings
    const fwdPos = F.table.filter(t => t.day_ci[0] > 0).length;
    const btcCal = C.scores.find(s => s.asset === 'BTC' && s.forecast === 'barrier model');
    const ethCal = C.scores.find(s => s.asset === 'ETH' && s.forecast === 'barrier model');
    const lgB = C.logit.find(l => l.asset === 'BTC'), lgE = C.logit.find(l => l.asset === 'ETH');
    const tot = F.table.reduce((a, t) => ({ e: a.e + t.edge_at_mid, c: a.c + t.spread_depth_cost, f: a.f + t.fees, n: a.n + t.net }), { e: 0, c: 0, f: 0, n: 0 });
    const items = [
      `<b>No forward-tested candidate has shown positive expected return after costs.</b> Six candidates that passed historical out-of-fold testing averaged <span class="mono">${sgn(100 * P.mean_research_oof_margin, 2, ' pp')}</span> above break-even in research; prospectively the pooled margin is <span class="mono">${sgn(100 * P.fixed_effect_mean, 2, ' pp')}</span> (95% CI <span class="mono">${sgn(100 * P.fixed_effect_ci[0], 2)} to ${sgn(100 * P.fixed_effect_ci[1], 2)} pp</span>) over ${R.scale.forward_trades.toLocaleString()} paper trades. ${fwdPos} of 6 have a forward confidence interval above zero.`,
      `<b>The Kalshi mid is a better forecaster than the spot-implied barrier model.</b> On ${(lgB.n_contracts + lgE.n_contracts).toLocaleString()} prospective entries the model's out-of-sample Brier score is worse than the mid's by <span class="mono">${fmt(btcCal.brier_minus_mid, 3)}</span> (BTC) and <span class="mono">${fmt(ethCal.brier_minus_mid, 3)}</span> (ETH), both CIs above zero; given the mid, the model's coefficient is indistinguishable from zero (z = ${fmt(lgB.z_model, 2)} / ${fmt(lgE.z_model, 2)}). The cross-venue "mispricing" those strategies traded was mostly model error.`,
      `<b>Execution cost decides the sign.</b> Across all forward trades, the outcome-vs-mid edge of <span class="mono">${money(tot.e, 0)}</span> paid <span class="mono">${money(-tot.c, 0)}</span> in spread and depth and <span class="mono">${money(-tot.f, 0)}</span> in fees, leaving <span class="mono">${money(tot.n, 0)}</span>.`,
    ];
    if (MW) {
      const pt = MW.passthrough.filter(p => p.asset === 'POOLED' && p.split_by === 'all');
      const at = h => (pt.find(p => p.h === h) || {}).R;
      const ex = MW.executable;
      const best = ex.filter(e => e.mean != null).sort((a, b) => (a.p_holm ?? 1) - (b.p_holm ?? 1))[0];
      items.push(`<b>Kalshi reprices with spot, not after it.</b> By the end of a 3σ five-second Kraken move, Kalshi has already priced <span class="mono">${fmt(100 * at(0), 0)}%</span> of the model-implied change, and <span class="mono">${fmt(100 * at(60), 0)}%</span> a minute later. A 1–5 s reaction leaves nothing to capture. All 12 latency rules lose about 2¢ per contract, worse than random-time entries, and none of the ${ex.length} preregistered latency, flow and mispricing rules is significant after correction (smallest Holm-adjusted p = ${fmt(best ? best.p_holm : null, 2)}; reality-check p = ${fmt(MW.reality_check_p, 2)}).`);
      const fs = MW.flow_ols.filter(o => o.signal === 'ofi_k30' && o.target === 'surprise');
      const minBh = Math.min(...MW.flow_ols.map(o => o.p_bh ?? 1));
      if (fs.length) items.push(`<b>A lead, not a result: aggressive flow looks contrarian.</b> Heavy YES-taker flow predicts settlement <i>below</i> the Kalshi mid on both assets (t = ${fs.map(o => fmt(o.t, 1) + ' ' + o.asset).join(', ')}), with no quote reversal within a minute. It does not survive correction across all ${MW.flow_ols.length} flow regressions (smallest BH-adjusted p = ${fmt(minBh, 2)}). It was not the preregistered direction, so it is recorded as a hypothesis for a future preregistered test.`);
    }
    el('rs-findings').innerHTML = '<ol class="findings">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';

    // ---- Q1 table + dumbbell + equity
    table(el('rs-fwd-table'), ['Candidate', 'Family', 'Forward period', 'Trades', 'Edge vs mid', 'Spread + depth', 'Fees', 'Net', 'Net / trade (95% CI)', 'Win vs w*', 'Max DD', 'Status'],
      F.table.map(t => [`<b>${t.code}</b> <span class="muted">${t.asset}</span>`, esc(t.family), `<span class="mono">${t.period}</span>`,
        t.trades.toLocaleString(), `<span class="mono">${money(t.edge_at_mid)}</span>`, `<span class="mono">${money(-t.spread_depth_cost)}</span>`,
        `<span class="mono">${money(-t.fees)}</span>`, `<span class="mono v ${cls(t.net)}">${money(t.net)}</span>`,
        `<span class="mono">${money(t.mean, 3)} [${sgn(t.day_ci[0], 2)}, ${sgn(t.day_ci[1], 2)}]</span>`,
        `<span class="mono">${(100 * t.win_rate).toFixed(1)}% vs ${(100 * t.w_star).toFixed(1)}%</span>`,
        `<span class="mono">${money(t.max_drawdown)}</span>`, esc(t.status)]));
    dumbbell(el('rs-shrink'), F.table.map(t => ({ label: `${t.code} ${t.asset}`, oof: t.oof_margin_pp, fwd: t.margin_pp,
      lo: t.day_ci[0] * 10, hi: t.day_ci[1] * 10, n: t.trades })));
    const eq = el('rs-equity');
    eq.innerHTML = R.equity.map((e, i) => `<div class="chart-box"><h4>${e.code} · ${e.asset} — ${esc(e.family)}</h4><div id="eq-${i}"></div><p class="cap">${esc(e.status)}</p></div>`).join('');
    R.equity.forEach((e, i) => equityPanel(el('eq-' + i), e, S[0]));

    // ---- Q2 calibration
    const rel = asset => [['market mid', S[0]], ['barrier model', S[1]]].map(([f, c]) => ({ label: f === 'market mid' ? 'Kalshi mid' : 'Kraken-implied barrier model', color: c,
      pts: C.reliability.filter(r => r.asset === asset && r.forecast === f).map(r => [r.f, r.o, null, null, r.n]) }));
    ['BTC', 'ETH'].forEach(a => linesChart(el('rs-rel-' + a.toLowerCase()), rel(a), { h: 260, diag: true, ymin: 0, ymax: 1,
      xticks: [0, .25, .5, .75, 1], xlab: t => t.toFixed(2), yfmt: t => t.toFixed(2), xtitle: 'forecast probability (YES) · y: observed settlement rate',
      tipx: v => 'forecast ' + v.toFixed(3), tipy: v => 'outcome rate ' + v.toFixed(3) }));
    table(el('rs-cal-table'), ['Asset', 'Forecast', 'Out-of-sample n', 'Brier', 'Log loss', 'Brier − mid (95% CI)'],
      C.scores.map(s => [s.asset, esc(s.forecast), s.n.toLocaleString(), fmt(s.brier, 4), fmt(s.log_loss, 4),
        s.brier_minus_mid == null ? '—' : `<span class="mono">${sgn(s.brier_minus_mid, 4)} [${sgn(s.ci[0], 4)}, ${sgn(s.ci[1], 4)}]</span>`]));
    const decs = a => C.deciles.filter(d => d.asset === a);
    ['BTC', 'ETH'].forEach(a => groupedBars(el('rs-dec-' + a.toLowerCase()), decs(a).map(d => 'D' + d.decile),
      [{ label: 'Model-claimed edge vs mid', color: S[1], vals: decs(a).map(d => d.claimed) },
       { label: 'Realised outcome − mid', color: S[0], vals: decs(a).map(d => d.realised) },
       { label: 'Net per contract after costs', color: S[2], vals: decs(a).map(d => d.net) }],
      { h: 230, yfmt: t => t.toFixed(2), tipy: v => sgn(v, 3), xtitle: 'decile of model-minus-mid (prospective entries)' }));

    // ---- Q3/Q4/Q5 market-wide
    if (MW) {
      const H = [0, 1, 2, 5, 10, 20, 30, 60, 120];
      const ser = (asset, by, bucket, label, color, dash) => ({ label, color, dash,
        pts: MW.passthrough.filter(p => p.asset === asset && p.split_by === by && String(p.bucket) === bucket && p.R != null)
          .map(p => [p.h, p.R, p.lo, p.hi, p.n]) });
      linesChart(el('rs-pass'), [ser('BTC', 'all', 'all', 'BTC', S[0]), ser('ETH', 'all', 'all', 'ETH', S[1])],
        { w: 1000, h: 300, xcat: H, xticks: H, xlab: t => t + 's', yref: 0, yfmt: t => Math.round(t * 100) + '%',
          xtitle: 'seconds after a 3σ five-second spot move', tipx: v => '+' + v + ' s', tipy: v => (100 * v).toFixed(0) + '%' });
      linesChart(el('rs-pass-liq'), [ser('POOLED', 'liq_regime', 'high prints', 'Busy book (prints above median)', S[0]),
        ser('POOLED', 'liq_regime', 'low prints', 'Quiet book', S[1])],
        { h: 230, xcat: H, xticks: H, xlab: t => t + 's', yref: 0, yfmt: t => Math.round(t * 100) + '%',
          xtitle: 'seconds after the spot move', tipx: v => '+' + v + ' s', tipy: v => (100 * v).toFixed(0) + '%' });
      const tteS = ['0-3 min', '3-7 min', '7-15 min'].map((b, i) => ser('POOLED', 'tte_bucket', b, b + ' to expiry', S[i]));
      linesChart(el('rs-pass-tte'), tteS, { h: 230, xcat: H, xticks: H, xlab: t => t + 's', yref: 0, yfmt: t => Math.round(t * 100) + '%',
        xtitle: 'seconds after the spot move', tipx: v => '+' + v + ' s', tipy: v => (100 * v).toFixed(0) + '%' });
      table(el('rs-exec'), ['Rule family', 'Asset', 'Variant', 'Test trades', 'Net / contract (95% CI)', 'Win vs w*', '+1 tick', '+1 s latency', 'Random-time baseline', 'Holm p'],
        MW.executable.map(e => [esc(e.family.replace(/^MW\d /, '')), e.asset, esc(e.family.startsWith('MW2') ? `latency ${e.latency_s}s · ${e.id.includes('m0.05') ? 'large' : 'medium'} move` : e.family.startsWith('MW3') ? e.id.split('_').slice(2).join(' ').replace('w', 'trailing ') + 's' : 'largest model-vs-mid gaps'),
          e.n, `<span class="mono v ${cls(e.mean)}">${sgn(e.mean, 3)}</span> <span class="mono muted">[${sgn(e.ci[0], 3)}, ${sgn(e.ci[1], 3)}]</span>`,
          e.win_rate == null ? '—' : `${(100 * e.win_rate).toFixed(1)}% vs ${(100 * e.w_star).toFixed(1)}%`,
          `<span class="mono">${sgn(e.mean_plus1tick, 3)}</span>`, `<span class="mono">${sgn(e.mean_L_plus1s, 3)}</span>`,
          `<span class="mono">${sgn(e.b0, 3)}</span>`, fmt(e.p_holm, 2)]));
      const fl = (a, sig, tgt) => MW.flow_deciles.filter(d => d.asset === a && d.signal === sig && d.target === tgt);
      ['BTC', 'ETH'].forEach(a => groupedBars(el('rs-flow-' + a.toLowerCase()), fl(a, 'ofi_k30', 'dM30').map(d => 'D' + d.decile),
        [{ label: 'Kalshi mid change, next 30 s', color: S[0], vals: fl(a, 'ofi_k30', 'dM30').map(d => d.mean) },
         { label: 'Settlement surprise (outcome − mid)', color: S[1], vals: fl(a, 'ofi_k30', 'surprise').map(d => d.mean) }],
        { h: 220, yfmt: t => t.toFixed(3), tipy: v => sgn(v, 4), xtitle: 'decile of signed Kalshi taker flow, trailing 30 s' }));
      const cov = MW.assets;
      table(el('rs-coverage'), ['Asset', 'Contracts listed / analysed', 'Kalshi prints', 'Median prints / contract', 'Kraken prints', 'Kraken gaps > 60 s', 'Two-sided mid available (≤2 s)', 'Spot print ≤ 1 s old', 'Median quoted spread'],
        Object.entries(cov).map(([a, c]) => [a, `${c.contracts_listed} / ${c.contracts_analysed}`, (c.kalshi_prints || 0).toLocaleString(),
          Math.round(c.median_prints_per_contract || 0).toLocaleString(), (c.kraken_prints || 0).toLocaleString(), c.kraken_gaps_gt_60s,
          ((c.mid_availability_2s || 0) * 100).toFixed(1) + '%', ((c.spot_print_age_le_1s || 0) * 100).toFixed(1) + '%',
          c.median_candle_spread == null ? '—' : (100 * c.median_candle_spread).toFixed(1) + '¢']));
      setT('rs-mw-window', `${MW.sample_window.window_start_utc.slice(0, 10)} → ${MW.sample_window.window_end_utc.slice(0, 10)} (end exclusive) · discovery ${MW.discovery_days[0]}…${MW.discovery_days[MW.discovery_days.length - 1]} · test ${MW.test_days[0]}…${MW.test_days[MW.test_days.length - 1]}`);
      table(el('rs-mw-cal'), ['Asset', 'Forecast', 'Test n', 'Brier', 'Log loss', 'ECE', 'Brier − mid (95% CI)'],
        MW.calibration.map(s => [s.asset, s.forecast === 'M' ? 'Kalshi mid' : s.forecast === 'P' ? 'Barrier model (1 s spot vol)' : 'Recalibrated blend', s.n,
          fmt(s.brier, 4), fmt(s.log_loss, 4), fmt(s.ece, 3), s.brier_minus_mid == null ? '—' : `<span class="mono">${sgn(s.brier_minus_mid, 4)} [${sgn(s.ci[0], 4)}, ${sgn(s.ci[1], 4)}]</span>`]));
    } else {
      document.querySelectorAll('.needs-mw').forEach(n => { n.innerHTML = '<div class="chart-empty">Public tick-sample results not yet available.</div>'; });
    }

    // ---- Q5 cost decomposition + sensitivity
    groupedBars(el('rs-costs'), F.table.map(t => `${t.code} ${t.asset}`),
      [{ label: 'Edge vs mid', color: S[0], vals: F.table.map(t => t.edge_at_mid / t.trades) },
       { label: 'Spread + depth', color: S[1], vals: F.table.map(t => -t.spread_depth_cost / t.trades) },
       { label: 'Fees', color: S[3], vals: F.table.map(t => -t.fees / t.trades) },
       { label: 'Net', color: S[2], vals: F.table.map(t => t.net / t.trades) }],
      { w: 1000, h: 300, yfmt: t => '$' + t.toFixed(2), tipy: v => money(v, 3) + ' per 10-contract trade' });
    const sc = ['base', '+1 tick', '+2 ticks', 'fee x1.5', '+1 tick & fee x1.5'];
    table(el('rs-sens'), ['Candidate', ...sc.map(s => s === 'base' ? 'As filled' : s)],
      F.table.map(t => [`<b>${t.code}</b> ${t.asset}`, ...sc.map(k => `<span class="mono v ${cls(t.sens_net[k])}">${money(t.sens_net[k])}</span>`)]));
  }).catch(err => { const e = el('rs-findings'); if (e) e.textContent = 'Research data unavailable: ' + err; });
})();
