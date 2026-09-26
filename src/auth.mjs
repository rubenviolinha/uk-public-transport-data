import { timingSafeEqual } from 'node:crypto';

export function hasValidBearerToken(headers, expectedToken) {
  if (!expectedToken) return false;
  const authorization = headers.authorization ?? '';
  if (!authorization.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
