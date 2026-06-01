import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verify, extractToken } from '../lib/jwt';
import { prisma } from '../lib/db';

async function authenticate(req: VercelRequest): Promise<string | null> {
  const token = extractToken(req.headers.cookie as string | undefined);
  if (!token) return null;
  try {
    const payload = await verify(token);
    return payload.userId;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await authenticate(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const row = await prisma.progress.findUnique({ where: { userId } });
    return res.json({ data: row ? JSON.parse(row.data) : null });
  }

  if (req.method === 'PUT') {
    const { data } = req.body as { data: Record<string, string> };
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid data' });
    }
    await prisma.progress.upsert({
      where:  { userId },
      update: { data: JSON.stringify(data) },
      create: { userId, data: JSON.stringify(data) },
    });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
