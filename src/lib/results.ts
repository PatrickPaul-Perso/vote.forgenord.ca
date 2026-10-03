export type VoteResult = {
  id: string;
  name_fr: string;
  name_en: string;
  image_key: string | null;
  external_url: string | null;
  archived: number;
  votes: number;
};

// Include archived options so historical votes remain part of the denominator.
export const voteResultsQuery = `
  SELECT o.id, o.name_fr, o.name_en, o.image_key, o.external_url, o.archived,
         COUNT(v.participation_id) AS votes
  FROM poll_options o
  LEFT JOIN votes v ON v.option_id = o.id AND v.poll_id = o.poll_id
  WHERE o.poll_id = ?
  GROUP BY o.id
  ORDER BY o.sort_order, o.id
`;

export async function loadVoteResults(db: D1Database, pollId: string) {
  return (await db.prepare(voteResultsQuery).bind(pollId).all<VoteResult>()).results;
}
