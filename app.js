const button=document.getElementById("askButton");
const input=document.getElementById("question");
const message=document.getElementById("message");
const card=document.getElementById("answerCard");
const answer=document.getElementById("answer");
button.addEventListener("click",async()=>{
  const question=input.value.trim();
  if(question.length<10){message.textContent="Please enter a specific question of at least 10 characters.";return;}
  button.disabled=true;message.textContent="Reviewing the available evidence…";card.classList.add("hidden");
  try{
    const response=await fetch("/api/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"The request failed.");
    answer.textContent=data.answer;card.classList.remove("hidden");message.textContent="";
  }catch(error){message.textContent=error.message||"Something went wrong.";}
  finally{button.disabled=false;}
});
