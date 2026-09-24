const form=document.getElementById("feedbackForm");
const statusEl=document.getElementById("formStatus");
const submitBtn=form.querySelector('button[type="submit"]');
const endpoint="https://formsubmit.co/ajax/juejiangfm@gmail.com";
let pending=false;

function showStatus(message,state=""){
  statusEl.textContent=message;
  statusEl.dataset.state=state;
  statusEl.focus();
}

form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  if(pending||!form.reportValidity())return;
  pending=true;
  submitBtn.disabled=true;
  const original=submitBtn.textContent;
  submitBtn.textContent="正在提交…";
  showStatus("正在发送，请稍候。");
  const data=Object.fromEntries(new FormData(form));
  try{
    const response=await fetch(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({...data,_subject:"插件反馈："+data.plugin+" / "+data.type,_captcha:"false",_template:"table"})
    });
    const result=await response.json();
    if(!response.ok||![true,"true"].includes(result.success))throw new Error("submit failed");
    form.reset();
    showStatus("已提交。谢谢你的反馈。","success");
  }catch(error){
    showStatus("暂时无法确认提交成功，请稍后重试。","error");
  }finally{
    pending=false;
    submitBtn.disabled=false;
    submitBtn.textContent=original;
  }
});