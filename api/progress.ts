import type { VercelRequest, VercelResponse } from '@vercel/node';

// Calls Neon's SQL HTTP API directly — zero npm dependencies, nothing to bundle.
async function sql(query: string, params: (string | null)[] = []) {
  const connStr = process.env.POSTGRES_URL!;
  const u = new URL(connStr);
  const endpoint = `https://${u.hostname}/sql`;
  const auth = Buffer.from(`${u.username}:${u.password}`).toString('base64');

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr,
    },
    body: JSON.stringify({ query, params }),
  });

  if (!resp.ok) throw new Error(`DB error ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as { rows: Record<string, string>[] };
  return json.rows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS progress (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    if (req.method === 'GET') {
      const rows = await sql(`SELECT data FROM progress WHERE key = 'main'`);
      return res.json({ data: rows[0] ? JSON.parse(rows[0].data) : null });
    }

    if (req.method === 'PUT') {
      const { data } = req.body as { data: Record<string, string> };
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Missing data' });
      }
      await sql(
        `INSERT INTO progress (key, data, updated_at)
         VALUES ('main', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
        [JSON.stringify(data)]
      );
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}
