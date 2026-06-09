import type { VercelRequest, VercelResponse } from '@vercel/node';

async function sql(query: string, params: (string | number | null)[] = []) {
  const connStr = process.env.POSTGRES_URL!;
  const u = new URL(connStr);
  const resp = await fetch(`https://${u.hostname}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connStr },
    body: JSON.stringify({ query, params }),
  });
  if (!resp.ok) throw new Error(`DB error ${resp.status}: ${await resp.text()}`);
  return ((await resp.json()) as { rows: Record<string, string>[] }).rows;
}

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: { id: number; firstname: string; lastname: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const appUrl = `${proto}://${req.headers.host}`;
  const { code, error } = req.query as Record<string, string>;

  if (error || !code) return res.redirect(302, `${appUrl}?strava=denied`);

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const t = (await tokenRes.json()) as StravaTokenResponse;

    await sql(`
      CREATE TABLE IF NOT EXISTS strava_tokens (
        id TEXT PRIMARY KEY,
        athlete_id BIGINT,
        athlete_name TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      )
    `);
    await sql(
      `INSERT INTO strava_tokens (id,athlete_id,athlete_name,access_token,refresh_token,expires_at)
       VALUES ('default',$1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         athlete_id=$1,athlete_name=$2,access_token=$3,refresh_token=$4,expires_at=$5`,
      [t.athlete.id, `${t.athlete.firstname} ${t.athlete.lastname}`, t.access_token, t.refresh_token, t.expires_at],
    );
    res.redirect(302, `${appUrl}?strava=ok`);
  } catch (e) {
    res.redirect(302, `${appUrl}?strava=error&msg=${encodeURIComponent(String(e))}`);
  }
}
