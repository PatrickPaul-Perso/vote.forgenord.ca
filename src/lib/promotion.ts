/** Server-only: no code is returned outside its validity window or before participation. */
export async function promotionFor(db: D1Database, pollId: string, participantToken: string, now = new Date()): Promise<string | null> {
  const participation = await db.prepare('SELECT id FROM participations WHERE poll_id = ? AND participant_token = ?').bind(pollId, participantToken).first();
  if (!participation) return null;
  const result = await db.prepare('SELECT key, value FROM poll_parameters WHERE poll_id = ?').bind(pollId).all<{key: string; value: string}>();
  const values = Object.fromEntries(result.results.map(row => [row.key, row.value]));
  const start = Date.parse(values.promo_starts_at ?? '');
  const end = Date.parse(values.promo_ends_at ?? '');
  return values.promo_code && Number.isFinite(start) && Number.isFinite(end) && start <= now.getTime() && now.getTime() < end ? values.promo_code : null;
}
