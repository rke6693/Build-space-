import Link from 'next/link';

export default function Pricing() {
  return (
    <main className="container">
      <h1>Pricing</h1>
      <p style={{ marginTop: 8 }}>Cancel any time. Prices in USD, taxes handled by Stripe.</p>
      <div className="row" style={{ marginTop: 32 }}>
        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          <h2 style={{ margin: 0 }}>Free</h2>
          <p style={{ fontSize: 32, color: '#fff', fontWeight: 800, margin: '12px 0' }}>$0</p>
          <ul style={{ paddingLeft: 18, color: 'var(--muted)' }}>
            <li>3 runs per day</li>
            <li>Local best-score tracking</li>
          </ul>
          <Link href="/login" className="btn secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            Start playing
          </Link>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 260, borderColor: 'var(--accent)' }}>
          <h2 style={{ margin: 0 }}>Pro</h2>
          <p style={{ fontSize: 32, color: '#fff', fontWeight: 800, margin: '12px 0' }}>$4.99<span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted)' }}>/mo</span></p>
          <ul style={{ paddingLeft: 18, color: 'var(--muted)' }}>
            <li>Unlimited runs</li>
            <li>Global leaderboard</li>
            <li>Cosmetic skins &amp; trails</li>
            <li>Cancel any time</li>
          </ul>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="plan" value="pro_monthly" />
            <button type="submit" className="btn">Go Pro</button>
          </form>
        </div>
      </div>
    </main>
  );
}
