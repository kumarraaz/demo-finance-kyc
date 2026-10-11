import { randomUUID } from "node:crypto";
import { SESSION_TTL_SECONDS } from "./constants";
import type { Db } from "./db";
import { createSessionToken, verifySessionToken } from "./session";

export async function startAdminSession(db: Db, username: string, secret: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.adminSession.create({
    data: { id, username, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000) },
  });
  // Opportunistic cleanup of long-dead sessions.
  await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } } });
  return createSessionToken(username, id, secret, now.getTime());
}

/** Full check: valid signature AND a live (unexpired, unrevoked) server-side session. */
export async function validateAdminSession(
  db: Db,
  token: string | undefined,
  secret: string,
  expectedUsername: string,
): Promise<string | null> {
  const payload = await verifySessionToken(token, secret);
  if (!payload || payload.sub !== expectedUsername) return null;
  const row = await db.adminSession.findUnique({ where: { id: payload.sid } });
  if (!row || row.revokedAt || row.expiresAt <= new Date() || row.username !== payload.sub) return null;
  return row.username;
}

export async function revokeAdminSession(db: Db, token: string | undefined, secret: string): Promise<void> {
  const payload = await verifySessionToken(token, secret);
  if (!payload) return;
  await db.adminSession.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } });
}
