import Link from 'next/link';

export default function Landing() {
  return (
    <main className="container">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 64 }}>
        <strong>Space Runner</strong>
        <div className="row">
          <Link href="/pricing" className="btn secondary">Pricing</Link>
          <Link href="/login" className="btn">Sign in</Link>
        </div>
      </nav>
      <section>
        <h1>
          Dodge, collect, climb the leaderboard.
        </h1>
        <p style={{ maxWidth: 560, marginTop: 16 }}>
          A buttery 3D endless runner in your browser. Three lanes. Infinite obstacles. Free to try — Pro unlocks
          unlimited runs, cosmetics, and the global leaderboard.
        </p>
        <div className="row" style={{ marginTop: 32 }}>
          <Link href="/play" className="btn">Play now</Link>
          <Link href="/pricing" className="btn secondary">Go Pro — $4.99/mo</Link>
        </div>
      </section>
      <section style={{ marginTop: 64 }}>
        <h2>Why Pro?</h2>
        <div className="row">
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <strong>Unlimited runs</strong>
            <p>Free: 3 runs/day. Pro: as many as you want.</p>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <strong>Global leaderboard</strong>
            <p>Your best score, ranked worldwide.</p>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 240 }}>
            <strong>Cosmetics</strong>
            <p>Ship skins, trails, and victory flourishes.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
