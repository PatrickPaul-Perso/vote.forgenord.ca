export type Poll={id:string;slug:string;organization:string;title_fr:string;title_en:string;description_fr:string;description_en:string;status:string;opens_at:string|null;closes_at:string|null;proposal_terms_fr:string;proposal_terms_en:string;proposal_terms_version:string};
export type Option={id:string;name_fr:string;name_en:string;description_fr:string;description_en:string;image_key:string|null;external_url:string|null};
export function isOpen(poll:Pick<Poll,'status'|'opens_at'|'closes_at'>,now=Date.now()){return poll.status==='published'&&(!poll.opens_at||Date.parse(poll.opens_at)<=now)&&(!poll.closes_at||now<Date.parse(poll.closes_at));}
export function safeLink(value:string|null){try{const url=new URL(value??'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export function safePhoto(value:string|null){return value&&/^[a-z0-9_-]+\.jpg$/.test(value)?'/models/'+value:null;}
export function parseChoice(form:FormData,options:Option[],poll:Poll){
 const choice=String(form.get('choice')??'');const title=String(form.get('title')??'').trim();const description=String(form.get('description')??'').trim();
 if(choice==='proposal'){
  if(title.length<2||title.length>100||description.length>1000||!form.has('reuse')||!poll.proposal_terms_version||!poll.proposal_terms_fr||!poll.proposal_terms_en)return null;
  return {type:'proposal' as const,title,description,option:null};
 }
 return options.some(o=>o.id===choice)?{type:'vote' as const,title:'',description:'',option:choice}:null;
}
export async function saveChoice(db:D1Database,poll:Poll,token:string,choice:NonNullable<ReturnType<typeof parseChoice>>,language:'fr'|'en'){
 // Deleting and re-creating the choice preserves the participation ID and audit consents.
 const existing=await db.prepare('SELECT id FROM participations WHERE poll_id=? AND participant_token=?').bind(poll.id,token).first<{id:string}>();
 const id=existing?.id??crypto.randomUUID();
 const statements=[db.prepare('DELETE FROM votes WHERE participation_id=?').bind(id),db.prepare('DELETE FROM proposals WHERE participation_id=?').bind(id),
 db.prepare(`INSERT INTO participations(id,poll_id,participant_token,choice_type) SELECT ?,?,?,? FROM polls WHERE id=? AND status='published' AND (opens_at IS NULL OR julianday(opens_at)<=julianday('now')) AND (closes_at IS NULL OR julianday(closes_at)>julianday('now')) ON CONFLICT(poll_id,participant_token) DO UPDATE SET choice_type=excluded.choice_type,updated_at=CURRENT_TIMESTAMP`).bind(id,poll.id,token,choice.type,poll.id)];
 if(choice.type==='vote')statements.push(db.prepare(`INSERT INTO votes(participation_id,poll_id,option_id) VALUES (?,(SELECT id FROM polls WHERE id=? AND status='published' AND (opens_at IS NULL OR julianday(opens_at)<=julianday('now')) AND (closes_at IS NULL OR julianday(closes_at)>julianday('now'))),(SELECT id FROM poll_options WHERE id=? AND poll_id=? AND archived=0))`).bind(id,poll.id,choice.option,poll.id));
 else {statements.push(db.prepare(`INSERT INTO proposals(participation_id,poll_id,title,description,language) VALUES (?,(SELECT id FROM polls WHERE id=? AND status='published' AND (opens_at IS NULL OR julianday(opens_at)<=julianday('now')) AND (closes_at IS NULL OR julianday(closes_at)>julianday('now'))),?,?,?)`).bind(id,poll.id,choice.title,choice.description,language));statements.push(db.prepare("INSERT INTO consents(id,poll_id,participation_id,purpose,text_fr,text_en,version) VALUES (?,?,?,'model_reuse',?,?,?)").bind(crypto.randomUUID(),poll.id,id,poll.proposal_terms_fr,poll.proposal_terms_en,poll.proposal_terms_version));}
 await db.batch(statements);return id;
}
