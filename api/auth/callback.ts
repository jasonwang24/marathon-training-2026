import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/db';
import { sign } from '../../lib/jwt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?auth_error=1');
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code:          code as string,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${process.env.APP_URL}/api/auth/callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect('/?auth_error=1');

    // Fetch Google user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userRes.json();

    if (!gUser.email) return res.redirect('/?auth_error=1');

    // Upsert user
    const user = await prisma.user.upsert({
      where:  { email: gUser.email },
      update: { name: gUser.name ?? 'Athlete', googleId: gUser.id },
      create: { email: gUser.email, name: gUser.name ?? 'Athlete', googleId: gUser.id },
    });

    const token = await sign({ userId: user.id, email: user.email, name: user.name });

    res.setHeader(
      'Set-Cookie',
      `marathon_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    );
    res.redirect('/');
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.redirect('/?auth_error=1');
  }
}
