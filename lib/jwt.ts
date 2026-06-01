import { SignJWT, jwtVerify } from 'jose';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function sign(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export async function verify(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret());
  return payload as unknown as SessionPayload;
}

export function extractToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const pair = cookieHeader.split('; ').find(c => c.startsWith('marathon_session='));
  return pair ? pair.slice('marathon_session='.length) : null;
}
