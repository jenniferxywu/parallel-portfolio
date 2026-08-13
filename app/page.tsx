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
  currency: string;
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
  currency: "SGD",
  updatedAt: new Date().toISOString(),
  totalValue: 0,
  dayChange: 0,
  dayChangePct: 0,
  invested: 0,
  cash: 0,
  sources: {
    Moomoo: { connected: false, value: 0, detail: "Bridge not configured" },
    Bitget: { connected: false, value: 0, detail: "API key not configured" },
  },
  history: Array(22).fill(0),
  holdings: [],
};

const money = (value: number, currency: string, hidden = false) => hidden ? "••••••" : new Intl.NumberFormat("en-SG", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const signed = (value: number, currency: string) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value), currency)}`;

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
  const lastUpdated = new Date(portfolio.updatedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });

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
            <span className={portfolio.mode === "live" ? "mode live" : "mode"}><i />{portfolio.mode === "live" ? "Live data" : "Not connected"}</span>
            <button className="icon-button" aria-label={hidden ? "Show balances" : "Hide balances"} onClick={() => setHidden(!hidden)}>{hidden ? "○" : "◉"}</button>
            <button className="refresh-button" onClick={refresh} disabled={loading}><span className={loading ? "spin" : ""}>↻</span>{loading ? "Syncing" : "Refresh"}</button>
          </div>
        </header>

        <div className="content">
          <section className="hero-grid">
            <div className="value-panel">
              <div className="eyebrow">TOTAL PORTFOLIO VALUE <button aria-label="Hide value" onClick={() => setHidden(!hidden)}>◉</button></div>
              <div className="total-value">{money(portfolio.totalValue, portfolio.currency, hidden)}</div>
              <div className="performance"><span>{signed(portfolio.dayChange, portfolio.currency)}</span><span>+{portfolio.dayChangePct.toFixed(2)}%</span><small>today</small></div>
              <div className="chart" aria-label="Portfolio value trend">
                {portfolio.history.map((point, index) => <i key={index} style={{ height: portfolio.mode === "live" ? `${Math.max(16, point)}%` : "2px" }} />)}
              </div>
              <div className="chart-labels"><span>JUL 14</span><span>JUL 21</span><span>JUL 28</span><span>AUG 4</span><span>TODAY</span></div>
            </div>
            <div className="summary-panel">
              <div className="summary-row"><span>Invested</span><strong>{money(portfolio.invested, portfolio.currency, hidden)}</strong></div>
              <div className="summary-row"><span>Available cash</span><strong>{money(portfolio.cash, portfolio.currency, hidden)}</strong></div>
              <div className="summary-row muted"><span>Last updated</span><strong>Today, {lastUpdated}</strong></div>
              <button className="primary-button" onClick={() => setSetupOpen(true)}>Manage connections <span>→</span></button>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><h2>Connected accounts</h2><p>One view across every platform</p></div><button className="text-button" onClick={() => setSetupOpen(true)}>Connection settings →</button></div>
            <div className="account-grid">
              <article className="account-card moomoo-card">
                <div className="account-logo moomoo-logo">m</div><div className="account-name"><strong>Moomoo</strong><span className={portfolio.sources.Moomoo.connected ? "status connected" : "status demo"}><i />{portfolio.sources.Moomoo.connected ? "Connected" : "Demo"}</span></div>
                <div className="account-value">{money(portfolio.sources.Moomoo.value, portfolio.currency, hidden)}</div><small>{moomooShare}% of portfolio</small>
                <div className="account-bar"><i style={{ width: `${moomooShare}%` }} /></div>
              </article>
              <article className="account-card bitget-card">
                <div className="account-logo bitget-logo">B</div><div className="account-name"><strong>Bitget</strong><span className={portfolio.sources.Bitget.connected ? "status connected" : "status demo"}><i />{portfolio.sources.Bitget.connected ? "Connected" : "Demo"}</span></div>
                <div className="account-value">{money(portfolio.sources.Bitget.value, portfolio.currency, hidden)}</div><small>{100 - moomooShare}% of portfolio</small>
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
                    <td>{item.quantity}</td><td><strong>{money(item.value, portfolio.currency, hidden)}</strong></td>
                    <td><div className="allocation-cell"><span>{item.allocation.toFixed(1)}%</span><i><b style={{ width: `${Math.min(100, item.allocation * 3)}%` }} /></i></div></td>
                    <td className={item.pnl >= 0 ? "positive" : "negative"}><strong>{item.pnl >= 0 ? "+" : "−"}{money(Math.abs(item.pnl), portfolio.currency, hidden)}</strong><small>{item.pnl >= 0 ? "+" : "−"}{Math.abs(item.pnlPct).toFixed(2)}%</small></td>
                  </tr>
                ))}{holdings.length === 0 && <tr><td colSpan={6} className="empty-state">No connected holdings yet. Connect an account and refresh.</td></tr>}</tbody>
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
