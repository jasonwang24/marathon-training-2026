import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const row = await prisma.progress.findUnique({ where: { key: 'main' } });
    return res.json({ data: row ? JSON.parse(row.data) : null });
  }

  if (req.method === 'PUT') {
    const { data } = req.body as { data: Record<string, string> };
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Missing data' });
    }
    await prisma.progress.upsert({
      where:  { id: 1 },
      update: { data: JSON.stringify(data) },
      create: { key: 'main', data: JSON.stringify(data) },
    });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
