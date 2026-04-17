import { signIn } from '@/lib/auth';

// Server-action driven login form. Uses Auth.js magic-link email.
export default function Login({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  async function action(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!email) return;
    await signIn('resend', { email, redirectTo: searchParams.next ?? '/dashboard' });
  }
  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: 36 }}>Sign in</h1>
      <p style={{ marginTop: 8 }}>We&apos;ll email you a one-time sign-in link.</p>
      {searchParams.error && (
        <p style={{ color: '#ff6b6b', marginTop: 16 }}>
          Something went wrong. Try again.
        </p>
      )}
      <form action={action} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff',
          }}
        />
        <button type="submit" className="btn">Send link</button>
      </form>
    </main>
  );
}
