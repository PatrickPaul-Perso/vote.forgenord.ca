import test from 'node:test';
import assert from 'node:assert/strict';
import { promotionFor } from '../src/lib/promotion.ts';
function database(participates, parameters) {
 return {prepare(sql) {return {bind() {return {async first(){return participates ? {id:'entry'} : null;},async all(){assert.match(sql,/poll_parameters/);return {results:Object.entries(parameters).map(([key,value])=>({key,value}))};}};}};}};
}
test('reads promotional value from D1 only for accepted participants within its period',async()=>{
 const parameters={promo_code:crypto.randomUUID(),promo_starts_at:'2026-10-01T00:00:00Z',promo_ends_at:'2026-10-03T00:00:00Z'};
 const now=new Date('2026-10-02T00:00:00Z');
 assert.equal(await promotionFor(database(true,parameters),'poll','token',now),parameters.promo_code);
 assert.equal(await promotionFor(database(false,parameters),'poll','token',now),null);
 assert.equal(await promotionFor(database(true,parameters),'poll','token',new Date(parameters.promo_ends_at)),null);
 assert.equal(await promotionFor(database(true,{...parameters,promo_ends_at:'invalid'}),'poll','token',now),null);
});
