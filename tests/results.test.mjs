import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { voteResultsQuery } from '../src/lib/results.ts';

test('results isolate consultations, count current votes, and retain zero and archived options', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(`INSERT INTO polls(id,slug,organization,title_fr,title_en) VALUES
    ('p','first','Org','Titre','Title'),('q','other','Org','Autre','Other');
    INSERT INTO poll_options(id,poll_id,name_fr,name_en,archived) VALUES
    ('a','p','A','A',0),('b','p','B','B',1),('c','p','C','C',0),('d','q','D','D',0);
    INSERT INTO participations(id,poll_id,participant_token,choice_type) VALUES
    ('v1','p','t1','vote'),('v2','p','t2','vote'),('v3','p','t3','vote'),('v4','q','t4','vote'),('idea','p','t5','proposal');
    INSERT INTO votes(participation_id,poll_id,option_id) VALUES ('v1','p','a'),('v2','p','a'),('v3','p','b'),('v4','q','d');
    INSERT INTO proposals(participation_id,poll_id,title,language) VALUES ('idea','p','Idea','en');`);
  const results = db.prepare(voteResultsQuery).all('p');
  assert.deepEqual(results.map(row => [row.id,row.votes]),[['a',2],['b',1],['c',0]]);
  assert.equal(results.reduce((sum,row) => sum + row.votes,0),3);
  db.exec("UPDATE votes SET option_id='b' WHERE participation_id='v2'");
  assert.deepEqual(db.prepare(voteResultsQuery).all('p').map(row => row.votes),[1,2,0]);
  db.close();
});
