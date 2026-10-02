import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const schema = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
function database() {
 const db = new DatabaseSync(':memory:'); db.exec(schema);
 db.exec("INSERT INTO polls(id,slug,organization,title_fr,title_en) VALUES ('p','test','Org','Titre','Title'),('q','other','Org','Autre','Other'); INSERT INTO poll_options(id,poll_id,name_fr,name_en) VALUES ('o','q','Nom','Name'); INSERT INTO participations(id,poll_id,participant_token,choice_type) VALUES ('v','p','token','vote');");
 return db;
}
test('rejects options from another consultation and duplicate browser participation',()=>{const db=database();assert.throws(()=>db.exec("INSERT INTO votes(participation_id,poll_id,option_id) VALUES ('v','p','o')"));assert.throws(()=>db.exec("INSERT INTO participations(id,poll_id,participant_token,choice_type) VALUES ('other','p','token','proposal')"));db.close();});
test('draw cannot open without published and validated bilingual terms',()=>{const db=database();assert.throws(()=>db.exec("INSERT INTO draws(id,poll_id,enabled) VALUES ('d','p',1)"));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM draw_entries').get().n,0);db.close();});
test('schema does not seed promotional codes',()=>{assert.doesNotMatch(schema,/INSERT\s+INTO\s+poll_parameters/i);});
