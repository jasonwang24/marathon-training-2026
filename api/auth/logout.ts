import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader(
    'Set-Cookie',
    'marathon_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );
  res.redirect('/');
}
