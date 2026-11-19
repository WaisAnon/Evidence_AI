export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (question.length < 10 || question.length > 1000) return reply({error:"Enter a valid question between 10 and 1,000 characters."},400);
    if (!context.env.GEMINI_API_KEY) return reply({error:"The AI key has not been configured yet."},500);

    const prompt = `You are Evidence AI, an evidence-based public-source research assistant.
Separate confirmed facts, official allegations, credible reporting, inference, and speculation.
Never treat a criminal charge as a conviction. Never present an unverified conspiracy claim as fact.
Do not provide stolen personal data, credentials, malware, or instructions for unauthorized access.
If current source material has not been supplied, clearly state that the answer is a preliminary background assessment and may not reflect recent developments.
Use exactly these headings:
Assessment
What is confirmed
What is alleged or disputed
What remains unverified
Reliability
Sources to check

Question: ${question}`;

    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    const response = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":context.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.2,maxOutputTokens:1200}})});
    const result=await response.json();
    if(!response.ok) return reply({error:"The AI service is unavailable. Check the Cloudflare logs and API key."},502);
    const answer=result.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("
").trim();
    if(!answer) return reply({error:"No answer was generated."},502);
    return reply({answer});
  } catch (error) {
    console.error(error);
    return reply({error:"Unable to process the request."},500);
  }
}
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
