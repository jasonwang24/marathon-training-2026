import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = neon(process.env.POSTGRES_URL!);

    await sql`
      CREATE TABLE IF NOT EXISTS progress (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM progress WHERE key = 'main'`;
      return res.json({ data: rows[0] ? JSON.parse(rows[0].data as string) : null });
    }

    if (req.method === 'PUT') {
      const { data } = req.body as { data: Record<string, string> };
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Missing data' });
      }
      const serialized = JSON.stringify(data);
      await sql`
        INSERT INTO progress (key, data, updated_at)
        VALUES ('main', ${serialized}, NOW())
        ON CONFLICT (key) DO UPDATE SET data = ${serialized}, updated_at = NOW()
      `;
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}
