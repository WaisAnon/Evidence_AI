const GROQ_URL="https://api.groq.com/openai/v1/chat/completions";
export async function onRequestPost(context){
  try{
    const body=await context.request.json().catch(()=>null);
    const question=String(body?.question||"").trim();
    const mode=["investigate","compare","debate"].includes(body?.mode)?body.mode:"investigate";
    if(question.length<5||question.length>1000)return json({error:"Enter a question between 5 and 1,000 characters."},400);

    const liveSources=await retrieveSources(question);
    if(!liveSources.length)return json({error:"No live sources could be retrieved for this question. Please rephrase it or try again shortly.",code:"NO_LIVE_SOURCES"},502);

    let result=null,provider="";
    if(context.env.GROQ_API_KEY){
      try{result=await callGroq(context.env.GROQ_API_KEY,question,mode,liveSources);provider="GroqCloud"}catch(e){console.error("Groq failed",e)}
    }
    if(!result&&context.env.GEMINI_API_KEY){
      try{result=await callGemini(context.env.GEMINI_API_KEY,question,mode,liveSources);provider="Google Gemini"}catch(e){console.error("Gemini failed",e)}
    }
    if(!result)return json({error:"Evidence AI is temporarily unavailable. Please try again later.",code:"AI_UNAVAILABLE"},503);

    return json({
      ...normalize(result,question),
      provider,
      sources:liveSources.map((s,i)=>({...s,id:i+1,verified:true})),
      sourceNotice:"These links were retrieved live from Crossref and/or Wikipedia during this investigation. ‘Retrieved live’ verifies that the source record and link were returned by the named service; it does not guarantee that every source is correct, conclusive, or equally relevant. Review the source itself before relying on it."
    });
  }catch(e){console.error(e);return json({error:"The investigation could not be completed.",code:"REQUEST_FAILED"},500)}
}

async function retrieveSources(question){
  const settled=await Promise.allSettled([crossref(question),wikipedia(question)]);
  const all=settled.flatMap(x=>x.status==="fulfilled"?x.value:[]);
  const seen=new Set();
  return all.filter(s=>{const key=s.url.toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).slice(0,8);
}

async function crossref(q){
  const u=new URL("https://api.crossref.org/works");
  u.searchParams.set("query.bibliographic",q);
  u.searchParams.set("rows","5");
  u.searchParams.set("select","DOI,title,author,published,container-title,URL,type");
  const r=await timedFetch(u,{headers:{Accept:"application/json","User-Agent":"EvidenceAI/1.0 (public research beta)"}},10000);
  if(!r.ok)throw new Error(`Crossref ${r.status}`);
  const d=await r.json();
  return (d?.message?.items||[]).map(item=>{
    const title=String(item.title?.[0]||"").trim();
    const doi=String(item.DOI||"").trim();
    const url=doi?`https://doi.org/${encodeURIComponent(doi).replace(/%2F/g,"/")}`:safeUrl(item.URL);
    const authors=(item.author||[]).slice(0,3).map(a=>[a.given,a.family].filter(Boolean).join(" ")).join(", ");
    const year=item.published?.["date-parts"]?.[0]?.[0]||"";
    const journal=String(item["container-title"]?.[0]||"");
    return {title,url,note:[authors,year,journal].filter(Boolean).join(" • "),sourceType:"Academic metadata via Crossref",retrievedFrom:"Crossref"};
  }).filter(x=>x.title&&x.url);
}

async function wikipedia(q){
  const u=new URL("https://en.wikipedia.org/w/api.php");
  u.searchParams.set("action","query");u.searchParams.set("generator","search");u.searchParams.set("gsrsearch",q);u.searchParams.set("gsrlimit","3");u.searchParams.set("prop","extracts|info");u.searchParams.set("inprop","url");u.searchParams.set("exintro","1");u.searchParams.set("explaintext","1");u.searchParams.set("exsentences","3");u.searchParams.set("format","json");u.searchParams.set("origin","*");
  const r=await timedFetch(u,{headers:{Accept:"application/json","User-Agent":"EvidenceAI/1.0"}},10000);
  if(!r.ok)throw new Error(`Wikipedia ${r.status}`);
  const d=await r.json();
  return Object.values(d?.query?.pages||{}).map(p=>({title:String(p.title||""),url:safeUrl(p.fullurl),note:String(p.extract||"").slice(0,420),sourceType:"Background source",retrievedFrom:"Wikipedia"})).filter(x=>x.title&&x.url);
}

function sourceContext(sources){return sources.map((s,i)=>`SOURCE ${i+1}\nTitle: ${s.title}\nProvider: ${s.retrievedFrom}\nURL: ${s.url}\nMetadata/snippet: ${s.note}`).join("\n\n")}
function systemPrompt(mode){
  const modeText={investigate:"Assess the claim without forcing certainty.",compare:"Compare using explicit criteria and explain how different weightings can change the conclusion.",debate:"Present the strongest evidence and reasoning on competing sides, including common ground."}[mode];
  return `You are Evidence AI, an independent evidence navigator. ${modeText} Base the assessment ONLY on the live source metadata and snippets supplied by the user. Do not invent sources, URLs, study titles, statistics, or quotations. Crossref confirms bibliographic metadata, not study quality. Wikipedia is a background source, not primary evidence. State when the supplied evidence is too weak or indirect. Return ONLY valid JSON: {"verdict":"short label","summary":"2-4 concise sentences","supports":["..."],"challenges":["..."],"uncertainties":["..."],"limitations":["..."]}. Keep each list to 2-5 items.`
}
async function callGroq(key,q,mode,sources){
  const r=await timedFetch(GROQ_URL,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"openai/gpt-oss-120b",temperature:.2,response_format:{type:"json_object"},messages:[{role:"system",content:systemPrompt(mode)},{role:"user",content:`QUESTION:\n${q}\n\nLIVE SOURCES:\n${sourceContext(sources)}`} ]})},25000);
  if(!r.ok)throw new Error(`Groq ${r.status}`);const d=await r.json();return parse(d?.choices?.[0]?.message?.content);
}
async function callGemini(key,q,mode,sources){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`;
  const r=await timedFetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:systemPrompt(mode)}]},contents:[{role:"user",parts:[{text:`QUESTION:\n${q}\n\nLIVE SOURCES:\n${sourceContext(sources)}`}]}],generationConfig:{temperature:.2,responseMimeType:"application/json"}})},25000);
  if(!r.ok)throw new Error(`Gemini ${r.status}`);const d=await r.json();return parse(d?.candidates?.[0]?.content?.parts?.[0]?.text);
}
async function timedFetch(url,opts,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}}
function parse(v){return JSON.parse(String(v||"").replace(/^```json\s*/i,"").replace(/```$/," ").trim())}
function normalize(d,q){const arr=x=>Array.isArray(x)?x.map(v=>String(v).slice(0,700)).slice(0,5):[];return{question:q,verdict:String(d.verdict||"Mixed or uncertain").slice(0,80),summary:String(d.summary||"").slice(0,1800),supports:arr(d.supports),challenges:arr(d.challenges),uncertainties:arr(d.uncertainties),limitations:arr(d.limitations)}}
function safeUrl(v){try{const u=new URL(String(v||""));return u.protocol==="https:"?u.toString():""}catch{return""}}
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}