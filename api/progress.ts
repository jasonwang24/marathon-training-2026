import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS progress (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    if (req.method === 'GET') {
      const { rows } = await client.query(
        `SELECT data FROM progress WHERE key = 'main'`
      );
      return res.json({ data: rows[0] ? JSON.parse(rows[0].data) : null });
    }

    if (req.method === 'PUT') {
      const { data } = req.body as { data: Record<string, string> };
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Missing data' });
      }
      const serialized = JSON.stringify(data);
      await client.query(
        `INSERT INTO progress (key, data, updated_at)
         VALUES ('main', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
        [serialized]
      );
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  } finally {
    client.release();
  }
}
