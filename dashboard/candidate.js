/* Deep-dive renderer for one HF forward candidate (window.CAND_ID set by page).
   Single-series charts (no legend needed — titles name the series); candidate
   identity color per page; crosshair tooltip on lines, per-bar tooltip on bars;
   explicit empty states while the forward ledger has no resolved observations. */
(function () {
  const COLORS = { xvfv_cheap_yes_hf_v0: '#5d6fe0', hfw017_spx_eth_v0: '#2e9e7a', hfw014_rpq_btc_v0: '#c07a2e' };
  const money = v => (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(2);
  const el = id => document.getElementById(id);

  function svgChart(box, series, key, kind, color) {
    if (!series.length) {
      box.innerHTML = '<div class="chart-empty"><span class="dot"></span>' +
        'Awaiting resolved observations</div>';
      return;
    }
    const W = box.clientWidth - 24, H = 170, padL = 46, padB = 20, padT = 8;
    const xs = series.map((d, i) => i);
    const ys = series.map(d => d[key]);
    const ymin = Math.min(0, ...ys), ymax = Math.max(0, ...ys);
    const x = i => padL + (W - padL - 8) * (xs.length === 1 ? 0.5 : i / (xs.length - 1));
    const y = v => padT + (H - padT - padB) * (1 - (v - ymin) / ((ymax - ymin) || 1));
    let marks = '';
    if (kind === 'bar') {
      const bw = Math.max(2, Math.min(18, (W - padL - 8) / xs.length - 2));
      marks = series.map((d, i) =>
        `<rect x="${x(i) - bw / 2}" y="${Math.min(y(0), y(d[key]))}" width="${bw}"
          height="${Math.abs(y(d[key]) - y(0)) || 1}" rx="2"
          fill="${d[key] >= 0 ? '#23c08a' : '#ff6b78'}"
          data-i="${i}"></rect>`).join('');
    } else {
      const pts = series.map((d, i) => `${x(i)},${y(d[key])}`).join(' ');
      marks = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>` +
        series.map((d, i) =>
          `<circle cx="${x(i)}" cy="${y(d[key])}" r="3.5" fill="${color}" data-i="${i}"
            stroke="#15151f" stroke-width="2"></circle>`).join('');
    }
    const gridY = [ymin, (ymin + ymax) / 2, ymax];
    box.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img">
      ${gridY.map(g => `<line class="grid-line" x1="${padL}" x2="${W - 4}" y1="${y(g)}" y2="${y(g)}"/>
        <text x="4" y="${y(g) + 3}">${g.toFixed(1)}</text>`).join('')}
      ${ymin < 0 ? `<line x1="${padL}" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" stroke="#2d2d3e" stroke-width="1.5"/>` : ''}
      ${marks}
      <text x="${padL}" y="${H - 4}">${series[0].date}</text>
      <text x="${W - 4}" y="${H - 4}" text-anchor="end">${series[series.length - 1].date}</text>
    </svg><div class="tip mono" style="display:none;position:absolute;background:#1c1c28;
      border:1px solid #2d2d3e;border-radius:6px;padding:5px 9px;font-size:.75em;pointer-events:none"></div>`;
    box.style.position = 'relative';
    const tip = box.querySelector('.tip');
    box.querySelectorAll('[data-i]').forEach(m => {
      m.addEventListener('mousemove', e => {
        const d = series[+m.dataset.i];
        tip.style.display = 'block';
        tip.style.left = Math.min(e.offsetX + 12, W - 120) + 'px';
        tip.style.top = (e.offsetY - 8) + 'px';
        tip.textContent = `${d.date} · ${money(d[key])}`;
      });
      m.addEventListener('mouseleave', () => tip.style.display = 'none');
    });
  }

  fetch('hf_forward_v1_data.json').then(r => r.json()).then(D => {
    const c = D.candidates[window.CAND_ID];
    const f = c.forward, color = COLORS[window.CAND_ID];
    document.title = c.code + ' — ' + c.title + ' — WSS HF';
    el('c-title').innerHTML = `${c.title} <span class="code">${c.code}</span>`;
    el('c-mech').textContent = c.mechanism;
    el('c-window').textContent = `${c.asset} · buys ${c.side} · ${c.window} · one entry per contract · settlement-held`;
    const r_ = c.research_oof, p = c.replay;
    el('kv-research').innerHTML = [
      [money(r_.pnl_usd), 'OOF PnL'], [r_.trades.toLocaleString(), 'OOF trades'],
      [r_.sharpe_ann.toFixed(2), 'OOF Sharpe (ann.)'], [r_.blocks_positive, 'Positive blocks'],
      [money(p.pnl_usd), 'Replay PnL'], [p.trades.toLocaleString(), 'Replay trades'],
      [p.sharpe_ann.toFixed(2), 'Replay Sharpe (ann.)'], [money(p.max_drawdown_usd), 'Replay max DD'],
    ].map(([v, k]) => `<div class="m"><div class="v mono">${v}</div><div class="k">${k}</div></div>`).join('');
    const live = f.state === 'live';
    el('kv-live').innerHTML = [
      [money(f.cum_pnl_usd), 'Cumulative PnL'],
      [f.resolved_trades, 'Resolved trades'],
      [f.sharpe_ann == null ? '—' : f.sharpe_ann.toFixed(2), 'Sharpe (ann.)'],
      [money(f.max_drawdown_usd), 'Max drawdown'],
      [f.days_live != null ? f.days_live + 'd' : '—', 'Time live'],
      [f.positive_day_pct != null ? f.positive_day_pct + '%' : '—', 'Positive days'],
      [f.avg_entry_price != null ? f.avg_entry_price.toFixed(3) : '—', 'Avg entry price'],
      [f.avg_fee_usd != null ? '$' + f.avg_fee_usd.toFixed(3) : '—', 'Avg fee'],
      [f.contracts_per_entry != null ? f.contracts_per_entry : '—', 'Contracts / entry'],
      [f.avg_capital_deployed_usd != null ? '$' + f.avg_capital_deployed_usd.toFixed(2) : '—', 'Avg deployed / trade'],
      [f.avg_net_per_trade_usd != null ? money(f.avg_net_per_trade_usd) : '—', 'Avg net / trade'],
      [f.net_per_100_deployed != null ? money(f.net_per_100_deployed) : '—', 'Net per $100 deployed'],
      [(f.latest_update_utc || '—').slice(0, 16).replace('T', ' '), 'Latest ledger update'],
      [(f.inception_utc || '—').slice(0, 16).replace('T', ' '), 'Inception (UTC)'],
    ].map(([v, k]) => `<div class="m"><div class="v mono">${v}</div><div class="k">${k}</div></div>`).join('');
    if (!live) el('live-state').innerHTML =
      '<div class="await"><span class="dot"></span>Awaiting resolved observations — ' +
      'the ledger began empty at inception and fills only from live paper settlements.</div>';
    svgChart(el('chart-cum'), f.daily_series, 'cum_pnl', 'line', color);
    svgChart(el('chart-dd'), f.daily_series, 'drawdown', 'line', color);
    svgChart(el('chart-daily'), f.daily_series, 'daily_pnl', 'bar', color);
    el('c-ablation').textContent = c.ablation_note;
    el('c-method').textContent =
      'Data window: synchronized 5-second Kalshi/Kraken ETH panel (frozen research snapshot) for ' +
      'selection; live public market state for forward evaluation. ' + D.sharpe_note +
      ' Fills are simulated with a walked 10-contract VWAP against the visible book plus exchange fees; ' +
      'stale or partial books reject the entry. ' + D.status_line +
      ' Data refreshed: ' + new Date(D.generated_utc).toISOString().slice(0,16).replace('T',' ') + ' UTC.';
  });
})();
