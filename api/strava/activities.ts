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

async function ensureTable() {
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
}

async function getValidToken() {
  await ensureTable();
  const rows = await sql(`SELECT * FROM strava_tokens WHERE id='default'`);
  if (!rows.length) return null;
  const tok = rows[0];

  if (Date.now() / 1000 < Number(tok.expires_at) - 300) {
    return { token: tok.access_token, athleteName: tok.athlete_name };
  }

  const refreshRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  });
  if (!refreshRes.ok) throw new Error(`Token refresh failed: ${refreshRes.status}`);
  const fresh = (await refreshRes.json()) as {
    access_token: string; refresh_token: string; expires_at: number;
  };
  await sql(
    `UPDATE strava_tokens SET access_token=$1,refresh_token=$2,expires_at=$3 WHERE id='default'`,
    [fresh.access_token, fresh.refresh_token, fresh.expires_at],
  );
  return { token: fresh.access_token, athleteName: tok.athlete_name };
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  workout_type?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') {
    try {
      await ensureTable();
      await sql(`DELETE FROM strava_tokens WHERE id='default'`);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await getValidToken();
    if (!auth) return res.json({ connected: false });

    // Fetch last 90 days of activities
    const after = Math.floor(Date.now() / 1000) - 90 * 86400;
    const apiRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=80`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!apiRes.ok) throw new Error(`Strava API error: ${apiRes.status}`);

    const activities = (await apiRes.json()) as StravaActivity[];
    const runs = activities
      .filter(a => a.type === 'Run' || a.sport_type === 'Run')
      .map(a => ({
        id: a.id,
        name: a.name,
        date: a.start_date_local.slice(0, 10), // YYYY-MM-DD local time
        distance_m: a.distance,
        moving_time_s: a.moving_time,
        average_speed_ms: a.average_speed,
        average_heartrate: a.average_heartrate ?? null,
        workout_type: a.workout_type ?? 0,
      }));

    return res.json({ connected: true, athlete: auth.athleteName, runs });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
