import Link from 'next/link';

export default function LoginError() {
  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: 36 }}>Sign-in failed</h1>
      <p style={{ marginTop: 8 }}>That link is invalid or has expired.</p>
      <Link href="/login" className="btn" style={{ marginTop: 16, display: 'inline-block' }}>
        Try again
      </Link>
    </main>
  );
}
