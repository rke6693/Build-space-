import { db } from '@/lib/db';

export const revalidate = 30; // cache 30s; leaderboard isn't real-time

export default async function Leaderboard() {
  const rows = await db.score.findMany({
    orderBy: { value: 'desc' },
    take: 50,
    select: {
      value: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  return (
    <main className="container">
      <h1>Leaderboard</h1>
      <table style={{ width: '100%', marginTop: 24, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
            <th style={{ padding: 12 }}>#</th>
            <th style={{ padding: 12 }}>Player</th>
            <th style={{ padding: 12 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <td style={{ padding: 12 }}>{i + 1}</td>
              <td style={{ padding: 12 }}>{displayName(r.user)}</td>
              <td style={{ padding: 12, color: '#fff', fontWeight: 700 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

// Never expose raw email to other users — show local part prefix only.
function displayName(u: { name: string | null; email: string | null }): string {
  if (u.name) return u.name;
  if (!u.email) return 'anonymous';
  const local = u.email.split('@')[0] ?? '';
  return local.length <= 3 ? `${local}***` : `${local.slice(0, 3)}***`;
}
