"use client";

import { useEffect, useMemo, useState } from "react";

type Source = "Moomoo" | "Bitget";
type Holding = {
  symbol: string;
  name: string;
  source: Source;
  kind: string;
  value: number;
  allocation: number;
  pnl: number;
  pnlPct: number;
  quantity: string;
};

type Portfolio = {
  mode: "demo" | "live";
  updatedAt: string;
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  invested: number;
  cash: number;
  sources: Record<Source, { connected: boolean; value: number; detail: string }>;
  history: number[];
  holdings: Holding[];
};

const demoPortfolio: Portfolio = {
  mode: "demo",
  updatedAt: new Date().toISOString(),
  totalValue: 184620.42,
  dayChange: 2384.18,
  dayChangePct: 1.31,
  invested: 168320.42,
  cash: 16300,
  sources: {
    Moomoo: { connected: false, value: 132480.2, detail: "Bridge not configured" },
    Bitget: { connected: false, value: 52140.22, detail: "API key not configured" },
  },
  history: [42, 45, 43, 49, 47, 53, 51, 56, 58, 55, 62, 65, 63, 69, 72, 70, 76, 81, 79, 86, 91, 94],
  holdings: [
    { symbol: "NVDA", name: "NVIDIA", source: "Moomoo", kind: "Equity", value: 38124.4, allocation: 20.65, pnl: 6280.2, pnlPct: 19.72, quantity: "211 shares" },
    { symbol: "BTC", name: "Bitcoin", source: "Bitget", kind: "Crypto", value: 28940.12, allocation: 15.68, pnl: 3441.08, pnlPct: 13.5, quantity: "0.264 BTC" },
    { symbol: "VOO", name: "Vanguard S&P 500 ETF", source: "Moomoo", kind: "ETF", value: 27170.8, allocation: 14.72, pnl: 2168.45, pnlPct: 8.67, quantity: "47 shares" },
    { symbol: "ETH", name: "Ethereum", source: "Bitget", kind: "Crypto", value: 15884.1, allocation: 8.6, pnl: -430.26, pnlPct: -2.64, quantity: "3.41 ETH" },
    { symbol: "AAPL", name: "Apple", source: "Moomoo", kind: "Equity", value: 24618.65, allocation: 13.34, pnl: 1836.2, pnlPct: 8.06, quantity: "103 shares" },
    { symbol: "QQQ", name: "Invesco QQQ Trust", source: "Moomoo", kind: "ETF", value: 19763.25, allocation: 10.7, pnl: 1130.44, pnlPct: 6.07, quantity: "35 shares" },
    { symbol: "USDT", name: "Tether", source: "Bitget", kind: "Cash", value: 7316, allocation: 3.96, pnl: 0, pnlPct: 0, quantity: "7,316 USDT" },
  ],
};

const money = (value: number, hidden = false) => hidden ? "••••••" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;

export default function Home() {
  const [portfolio, setPortfolio] = useState<Portfolio>(demoPortfolio);
  const [activeSource, setActiveSource] = useState<"All" | Source>("All");
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [activeView, setActiveView] = useState("Overview");

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      if (response.ok) setPortfolio(await response.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const holdings = useMemo(
    () => portfolio.holdings.filter((item) => activeSource === "All" || item.source === activeSource),
    [portfolio.holdings, activeSource]
  );
  const sourceTotal = portfolio.sources.Moomoo.value + portfolio.sources.Bitget.value || 1;
  const moomooShare = Math.round((portfolio.sources.Moomoo.value / sourceTotal) * 100);
  const lastUpdated = new Date(portfolio.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">P</span><span>Parallel</span></div>
        <nav aria-label="Primary navigation">
          {[
            ["Overview", "⌂"], ["Holdings", "▦"], ["Activity", "↗"], ["Analytics", "◫"], ["Connections", "⌁"]
          ].map(([label, icon]) => (
            <button key={label} className={activeView === label ? "nav-item active" : "nav-item"} onClick={() => setActiveView(label)}>
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><span className="lock">◇</span><div><strong>Read-only by design</strong><small>No trading permissions</small></div></div>
          <button className="nav-item"><span className="nav-icon">?</span>Help & setup</button>
          <div className="profile"><div className="avatar">JW</div><div><strong>Jennifer Wu</strong><small>Personal workspace</small></div><span>···</span></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><h1>{activeView}</h1><p>Your complete portfolio, in one place.</p></div>
          <div className="top-actions">
            <span className={portfolio.mode === "live" ? "mode live" : "mode"}><i />{portfolio.mode === "live" ? "Live data" : "Demo data"}</span>
            <button className="icon-button" aria-label={hidden ? "Show balances" : "Hide balances"} onClick={() => setHidden(!hidden)}>{hidden ? "○" : "◉"}</button>
            <button className="refresh-button" onClick={refresh} disabled={loading}><span className={loading ? "spin" : ""}>↻</span>{loading ? "Syncing" : "Refresh"}</button>
          </div>
        </header>

        <div className="content">
          <section className="hero-grid">
            <div className="value-panel">
              <div className="eyebrow">TOTAL PORTFOLIO VALUE <button aria-label="Hide value" onClick={() => setHidden(!hidden)}>◉</button></div>
              <div className="total-value">{money(portfolio.totalValue, hidden)}</div>
              <div className="performance"><span>{signed(portfolio.dayChange)}</span><span>+{portfolio.dayChangePct.toFixed(2)}%</span><small>today</small></div>
              <div className="chart" aria-label="Portfolio value trend">
                {portfolio.history.map((point, index) => <i key={index} style={{ height: `${Math.max(16, point)}%` }} />)}
              </div>
              <div className="chart-labels"><span>JUL 14</span><span>JUL 21</span><span>JUL 28</span><span>AUG 4</span><span>TODAY</span></div>
            </div>
            <div className="summary-panel">
              <div className="summary-row"><span>Invested</span><strong>{money(portfolio.invested, hidden)}</strong></div>
              <div className="summary-row"><span>Available cash</span><strong>{money(portfolio.cash, hidden)}</strong></div>
              <div className="summary-row muted"><span>Last updated</span><strong>Today, {lastUpdated}</strong></div>
              <button className="primary-button" onClick={() => setSetupOpen(true)}>Manage connections <span>→</span></button>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><h2>Connected accounts</h2><p>One view across every platform</p></div><button className="text-button" onClick={() => setSetupOpen(true)}>Connection settings →</button></div>
            <div className="account-grid">
              <article className="account-card moomoo-card">
                <div className="account-logo moomoo-logo">m</div><div className="account-name"><strong>Moomoo</strong><span className={portfolio.sources.Moomoo.connected ? "status connected" : "status demo"}><i />{portfolio.sources.Moomoo.connected ? "Connected" : "Demo"}</span></div>
                <div className="account-value">{money(portfolio.sources.Moomoo.value, hidden)}</div><small>{moomooShare}% of portfolio</small>
                <div className="account-bar"><i style={{ width: `${moomooShare}%` }} /></div>
              </article>
              <article className="account-card bitget-card">
                <div className="account-logo bitget-logo">B</div><div className="account-name"><strong>Bitget</strong><span className={portfolio.sources.Bitget.connected ? "status connected" : "status demo"}><i />{portfolio.sources.Bitget.connected ? "Connected" : "Demo"}</span></div>
                <div className="account-value">{money(portfolio.sources.Bitget.value, hidden)}</div><small>{100 - moomooShare}% of portfolio</small>
                <div className="account-bar"><i style={{ width: `${100 - moomooShare}%` }} /></div>
              </article>
              <article className="allocation-card">
                <div className="donut" style={{ background: `conic-gradient(#1d2020 0 ${moomooShare}%, #3ce7c0 ${moomooShare}% 100%)` }}><div>{portfolio.holdings.length}<small>assets</small></div></div>
                <div className="legend"><strong>Platform mix</strong><span><i className="dot dark" />Moomoo <b>{moomooShare}%</b></span><span><i className="dot mint" />Bitget <b>{100 - moomooShare}%</b></span></div>
              </article>
            </div>
          </section>

          <section className="section-block holdings-block">
            <div className="section-heading"><div><h2>Top holdings</h2><p>Ranked by current market value</p></div><div className="filter-group">{(["All", "Moomoo", "Bitget"] as const).map(source => <button key={source} onClick={() => setActiveSource(source)} className={activeSource === source ? "selected" : ""}>{source}</button>)}</div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Asset</th><th>Platform</th><th>Holdings</th><th>Value</th><th>Allocation</th><th>Total return</th></tr></thead>
                <tbody>{holdings.map((item) => (
                  <tr key={`${item.source}-${item.symbol}`}>
                    <td><div className={`asset-icon ${item.source.toLowerCase()}`}>{item.symbol.slice(0, 2)}</div><div className="asset-name"><strong>{item.symbol}</strong><small>{item.name}</small></div></td>
                    <td><span className={`platform-pill ${item.source.toLowerCase()}`}><i />{item.source}</span></td>
                    <td>{item.quantity}</td><td><strong>{money(item.value, hidden)}</strong></td>
                    <td><div className="allocation-cell"><span>{item.allocation.toFixed(1)}%</span><i><b style={{ width: `${Math.min(100, item.allocation * 3)}%` }} /></i></div></td>
                    <td className={item.pnl >= 0 ? "positive" : "negative"}><strong>{item.pnl >= 0 ? "+" : "−"}{money(Math.abs(item.pnl), hidden)}</strong><small>{item.pnl >= 0 ? "+" : "−"}{Math.abs(item.pnlPct).toFixed(2)}%</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {setupOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSetupOpen(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setSetupOpen(false)} aria-label="Close">×</button>
          <span className="modal-kicker">READ-ONLY CONNECTIONS</span><h2 id="setup-title">Bring both portfolios together</h2><p>Credentials stay on the server and are never sent to your browser. Use keys with read permissions only.</p>
          <div className="setup-list">
            <div><span className="setup-number">1</span><div><strong>Connect Bitget</strong><p>Create a read-only UTA API key, then add <code>BITGET_API_KEY</code>, <code>BITGET_SECRET_KEY</code>, and <code>BITGET_PASSPHRASE</code>.</p></div></div>
            <div><span className="setup-number">2</span><div><strong>Connect Moomoo OpenD</strong><p>Run OpenD with a private HTTP bridge, then add its endpoint as <code>MOOMOO_BRIDGE_URL</code> and token as <code>MOOMOO_BRIDGE_TOKEN</code>.</p></div></div>
          </div>
          <div className="safety-callout"><span>◇</span><p><strong>Safer default</strong>This dashboard contains no order-placement code. Withdrawal and trade permissions are not needed.</p></div>
          <button className="primary-button wide" onClick={() => { setSetupOpen(false); refresh(); }}>Check connections <span>↻</span></button>
        </section>
      </div>}
    </main>
  );
}
