import type { AstroCookies } from 'astro';
export type Language = 'fr' | 'en';
export function languageFor(request: Request, url: URL, cookies: AstroCookies): Language {
 const selected = url.searchParams.get('lang');
 if (selected === 'fr' || selected === 'en') {
  cookies.set('forgenord_language',selected,{path:'/',sameSite:'lax',httpOnly:true,secure:url.protocol==='https:',maxAge:31536000});return selected;
 }
 const saved = cookies.get('forgenord_language')?.value;
 if(saved==='fr'||saved==='en')return saved;
 const languages=(request.headers.get('accept-language')??'').split(',').map((entry,index)=>{const [tag,q]=entry.trim().toLowerCase().split(';q=');return {tag,weight:q===undefined?1:Number(q),index};}).filter(v=>/^(fr|en)(-|$)/.test(v.tag)&&v.weight>0&&v.weight<=1).sort((a,b)=>b.weight-a.weight||a.index-b.index);
 return languages[0]?.tag.startsWith('en')?'en':'fr';
}
