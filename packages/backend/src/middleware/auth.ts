import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { verifyJwt, type AuthTokenPayload } from '../services/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthTokenPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    await reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Missing bearer token' });
    return;
  }

  const token = header.slice(7).trim();
  const payload = verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    await reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    return;
  }

  request.authUser = payload;
}
