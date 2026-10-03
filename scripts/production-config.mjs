import { readFileSync, writeFileSync } from 'node:fs';
const id = process.env.FORGENORD_D1_DATABASE_ID;
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id === '00000000-0000-4000-8000-000000000000') throw new Error('Set FORGENORD_D1_DATABASE_ID outside Git.');
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
config.d1_databases[0].database_id = id;
config.routes = [{pattern:'vote.forgenord.ca',custom_domain:true}];
config.workers_dev = false;
writeFileSync('wrangler.production.jsonc', JSON.stringify(config,null,2)+'\n', {mode:0o600});
