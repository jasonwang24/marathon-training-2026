import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verify, extractToken } from '../lib/jwt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = extractToken(req.headers.cookie as string | undefined);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = await verify(token);
    return res.json({ id: payload.userId, email: payload.email, name: payload.name });
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
