const $ = s => document.querySelector(s);
const app = $("#app");
let assessment = null;
let quiz = { index:0, answers:{}, startedAt:null, studentName:"" };
let lastQuizResult = null;
let timerInterval = null;
let remaining = 0;

function esc(str=""){return String(str).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}

function structureQuestion(q){
  const text=String(q.text||"").trim();
  if(q.type==="mcq"&&Array.isArray(q.options)&&q.options.length)return q;
  const m=text.match(/^Multiple Choice:\s*(.*?)(?:\s+a\)\s+)(.*?)(?:\s+b\)\s+)(.*?)(?:\s+c\)\s+)(.*?)(?:\s+d\)\s+)(.*)$/i);
  if(m)return{...q,type:"mcq",text:m[1].trim(),options:[m[2].trim(),m[3].trim(),m[4].trim(),m[5].trim()]};
  if(/^Fill in the blank:/i.test(text))return{...q,type:"fill_blank",text:text.replace(/^Fill in the blank:\s*/i,"").trim()};
  if(/^True or False:/i.test(text))return{...q,type:"true_false",text:text.replace(/^True or False:\s*/i,"").trim()};
  if(/^Direct Question:/i.test(text))return{...q,type:"short_answer",text:text.replace(/^Direct Question:\s*/i,"").trim()};
  return{...q,type:q.type||"long_answer"};
}

function normalizeAllQuestions(){
  if(!assessment)return;
  if(assessment.type==="quiz")assessment.questions=(assessment.questions||[]).map(structureQuestion);
  else(assessment.sections||[]).forEach(s=>s.questions=(s.questions||[]).map(structureQuestion));
}

function formatQuestionText(text=""){
  return esc(text).replace(/\s+([a-dA-D]\))/g,"<br>$1").replace(/\s+(\([a-dA-D]\))/g,"<br>$1").replace(/\s+([A-D]\.)/g,"<br>$1");
}

async function init(){
  const id=new URLSearchParams(location.search).get("id");
  if(!id){renderDashboard();return;}
  await loadAssessment(id);
}

async function renderDashboard(){
  try{
    const res=await fetch("./assessments/index.json",{cache:"no-store"});
    if(!res.ok)throw new Error("No index");

    const data=await res.json();
    const live=(data.assessments||data.tests||[]).filter(a=>(a.status||"live")==="live");
    const attempts=loadAttempts();

    app.innerHTML=`
      <h1>Student Dashboard</h1>
      <p class="muted">Choose a live assessment to begin.</p>

      ${renderGroupedAssessments(live)}

      <h1 style="margin-top:34px">My Attempts</h1>
      <div class="assessment-list">
        ${attempts.length?attempts.map(a=>`
          <div class="assessment-card">
            <span class="pill">${esc(a.type)}</span>
            <h2>${esc(a.title)}</h2>
            <p class="muted">${a.type==="quiz"?`Score: ${a.score}/${a.total} · ${a.percentage}%`:"Completed"} · ${new Date(a.at).toLocaleString()}</p>
            ${a.slug?`<a class="btn secondary" href="./?id=${encodeURIComponent(a.slug)}">${a.type==="quiz"?"Retake":"Open"}</a>`:""}
          </div>`).join(""):`<p class="muted">No attempts stored on this device yet.</p>`}
      </div>`;
  }catch(e){
    app.innerHTML=`<div class="error"><b>No live assessments found.</b><br>Please make sure <code>assessments/index.json</code> exists.</div>`;
  }
}

function renderGroupedAssessments(items){
  if(!items.length){
    return `<p class="muted">No live assessments available right now.</p>`;
  }

  const grouped = {};

  items.forEach(a=>{
    const subject = a.subject || "Other";
    const className = a.className ? `Class ${a.className}` : "General";

    if(!grouped[subject]) grouped[subject] = {};
    if(!grouped[subject][className]) grouped[subject][className] = [];

    grouped[subject][className].push(a);
  });

  return Object.entries(grouped).map(([subject, classes])=>`
    <div class="subject-group">
      <h2>${esc(subject)}</h2>

      ${Object.entries(classes).map(([className, assessments])=>`
        <div class="class-group">
          <h3>${esc(className)}</h3>

          <div class="assessment-list">
            ${assessments.map(a=>`
              <div class="assessment-card">
                <span class="pill">${esc(a.type||"assessment")}</span>
                <h2>${esc(a.title)}</h2>
                <p class="muted">
                  ${[a.chapterName,a.duration].filter(Boolean).map(esc).join(" · ")}
                </p>
                <a class="btn primary" href="./?id=${encodeURIComponent(a.slug||a.id)}">
                  ${a.type==="quiz"?"Start Quiz":"Open Assessment"}
                </a>
              </div>`).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
}





async function loadAssessment(id){
  try{
    const res=await fetch(`./assessments/${encodeURIComponent(id)}.json`,{cache:"no-store"});
    if(!res.ok)throw new Error("not found");
    assessment=await res.json();
    normalizeAllQuestions();
    document.title=assessment.title||"ABLE™ iAssess";
    if(assessment.type==="quiz")renderQuizStart();else renderWritten();
  }catch(e){
    app.innerHTML=`<div class="error"><b>Assessment not found.</b><br>Please check <code>assessments/${esc(id)}.json</code>.</div>`;
  }
}

function renderWrittenQuestion(q,index){
  const n=structureQuestion(q);
  if(n.type==="mcq"&&Array.isArray(n.options)){
    return `<div class="question"><p><b>Q${index+1}.</b> ${esc(n.text)} <span class="muted">[${esc(n.marks)} marks]</span></p><div class="options-list">${n.options.map((o,i)=>`<div class="option-row"><b>${String.fromCharCode(65+i)}.</b> ${esc(o)}</div>`).join("")}</div>${n.responseLength?`<p class="muted">Suggested response: ${esc(n.responseLength)}</p>`:""}</div>`;
  }
  if(n.type==="true_false")return`<div class="question"><p><b>Q${index+1}.</b> ${formatQuestionText(n.text)} <span class="muted">[${esc(n.marks)} marks]</span></p><p class="muted">Answer: True / False</p></div>`;
  return`<div class="question"><p><b>Q${index+1}.</b> ${formatQuestionText(n.text)} <span class="muted">[${esc(n.marks)} marks]</span></p>${n.responseLength?`<p class="muted">Suggested response: ${esc(n.responseLength)}</p>`:""}</div>`;
}

function renderWritten(){
  const a=assessment;
  app.innerHTML=`
    <article>
      <div class="report-head"><img src="./Logo.png" alt="ABLE™" onerror="this.style.display='none'"><div><div class="muted">ABLE™ iAssess</div><h1>${esc(a.title)}</h1><div class="muted">${[a.subject,a.className?"Class "+a.className:"",a.chapterName,a.duration?"Duration: "+a.duration:"",a.maximumMarks?"Marks: "+a.maximumMarks:""].filter(Boolean).map(esc).join(" · ")}</div></div></div>
      <div class="actions no-print"><button class="primary" onclick="startTimed()">Start Timed Assessment</button><button class="secondary" onclick="window.print()">Download / Save PDF</button><button class="secondary" onclick="window.print()">Print Paper</button></div>
      <section><h2>Instructions</h2><ol>${(a.instructions||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></section>
      ${(a.sections||[]).map(s=>`
  <section>
    <h2>${esc(s.title)}</h2>

    ${s.directions ? `
      <div class="section-directions">
        ${formatQuestionText(s.directions)}
      </div>
    ` : ""}

    ${(s.questions||[]).map((q,i)=>renderWrittenQuestion(q,i)).join("")}
  </section>
`).join("")}
      <div class="actions no-print"><button class="primary" onclick="completeWritten()">Assessment Complete</button></div>
      <div id="completeBox" class="no-print"></div>
      <div class="report-footer">© 2026 Abhyast Private Limited. ABLE™ and TAKECARE™ are Registered Frameworks.</div>
    </article>`;
}

function startTimed(){
  const mins=Number(assessment.viewer?.durationMinutes)||parseInt(assessment.duration)||40;
  remaining=mins*60;$("#timer").style.display="flex";tick();clearInterval(timerInterval);timerInterval=setInterval(tick,1000);
}
function tick(){const m=Math.max(0,Math.floor(remaining/60)),s=Math.max(0,remaining%60);$("#timeText").textContent=String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");remaining--;if(remaining<0){clearInterval(timerInterval);alert("Time is up. Please submit your answer sheet.");}}
function completeWritten(){
  clearInterval(timerInterval);
  const phone=String(assessment.submission?.whatsapp||"919910686080").replace(/\D/g,"");
  const msg=encodeURIComponent("I have completed: "+(assessment.title||"Assessment")+". I am sending my answer sheet.");
  const drive=assessment.submission?.drive||"";
  saveAttempt({assessmentId:assessment.id,slug:assessment.slug,type:"written",title:assessment.title,status:"completed",at:new Date().toISOString()});
  $("#completeBox").innerHTML=`<div style="margin-top:20px;padding:20px;border:1px solid #e2e8f0;border-radius:16px;text-align:center"><h2>Assessment Complete</h2><p class="muted">Submit your handwritten answer sheet offline.</p><a class="btn success" href="https://wa.me/${phone}?text=${msg}" target="_blank">Submit via WhatsApp</a>${drive?` <a class="btn secondary" href="${esc(drive)}" target="_blank">Open Google Drive Folder</a>`:""}<br><br><a class="btn secondary" href="./">Back to Dashboard</a></div>`;
}

function renderQuizStart(){
  const allow=assessment.viewer?.showCorrectAnswersAfterSubmit!==false;
  app.innerHTML=`<div class="quiz-card"><div class="report-head"><img src="./Logo.png" alt="ABLE™" onerror="this.style.display='none'"><div><div class="muted">ABLE™ Interactive Quiz</div><h1>${esc(assessment.title)}</h1><div class="muted">${esc(assessment.subject)} ${assessment.className?"· Class "+esc(assessment.className):""}</div></div></div><label><b>Student Name</b><input id="studentName" type="text" placeholder="Enter your name"></label>${allow?`<p class="muted" style="margin-top:10px">Correct answers will be available after you submit the quiz.</p>`:""}<div class="actions"><button class="primary" onclick="startQuiz()">Start Quiz</button></div></div>`;
}
function startQuiz(){const name=$("#studentName")?.value||quiz.studentName||"Student";quiz={index:0,answers:{},startedAt:Date.now(),studentName:name.trim()||"Student"};lastQuizResult=null;const mins=Number(assessment.viewer?.durationMinutes)||parseInt(assessment.duration)||0;if(mins)startTimed();renderQuizCard();}
function takeQuizAgain(){clearInterval(timerInterval);$("#timer").style.display="none";quiz={index:0,answers:{},startedAt:Date.now(),studentName:quiz.studentName||"Student"};lastQuizResult=null;const mins=Number(assessment.viewer?.durationMinutes)||parseInt(assessment.duration)||0;if(mins)startTimed();renderQuizCard();}
function renderQuizCard(){const q=assessment.questions[quiz.index],ans=quiz.answers[q.id]||"";app.innerHTML=`<div class="quiz-card"><div class="muted">Question ${quiz.index+1} of ${assessment.questions.length}</div><h2>${esc(q.text)}</h2><div>${quizInput(q,ans)}</div><div class="actions" style="justify-content:space-between"><button class="secondary" onclick="prevQ()" ${quiz.index===0?"disabled":""}>Previous</button>${quiz.index===assessment.questions.length-1?`<button class="primary" onclick="submitQuiz()">Submit Quiz</button>`:`<button class="primary" onclick="nextQ()">Next</button>`}</div></div>`;}
function quizInput(q,ans){if(q.type==="fill_blank")return`<input id="answer" type="text" value="${esc(ans)}" placeholder="Type answer">`;const opts=q.type==="true_false"?["TRUE","FALSE"]:q.options;return(opts||[]).map((o,i)=>{const val=q.type==="true_false"?o:String.fromCharCode(65+i);return`<label class="option"><input type="radio" name="answer" value="${esc(val)}" ${ans===val||ans===o?"checked":""}> ${esc(o)}</label>`}).join("");}
function captureAnswer(){const q=assessment.questions[quiz.index];const input=q.type==="fill_blank"?$("#answer"):document.querySelector('input[name="answer"]:checked');if(input)quiz.answers[q.id]=input.value;}
function nextQ(){captureAnswer();quiz.index++;renderQuizCard();}
function prevQ(){captureAnswer();quiz.index--;renderQuizCard();}
function correctAnswerDisplay(q){const c=String(q.correctAnswer??"").trim();if(!c)return"Not provided";if(q.type==="mcq"&&Array.isArray(q.options)){const u=c.toUpperCase();if(/^[A-Z]$/.test(u)){const idx=u.charCodeAt(0)-65;if(q.options[idx])return`${u}. ${q.options[idx]}`}}return c;}
function studentAnswerDisplay(q,a){const ans=String(a??"").trim();if(!ans)return"Not answered";if(q.type==="mcq"&&Array.isArray(q.options)){const u=ans.toUpperCase();if(/^[A-Z]$/.test(u)){const idx=u.charCodeAt(0)-65;if(q.options[idx])return`${u}. ${q.options[idx]}`}}return ans;}
function isAnswerCorrect(q,a){const ans=String(a??"").trim().toLowerCase(),c=String(q.correctAnswer??"").trim().toLowerCase();if(!ans||!c)return false;if(q.type==="mcq")return String(a).trim().toUpperCase()===String(q.correctAnswer).trim().toUpperCase();return ans===c;}
async function submitQuiz(){captureAnswer();clearInterval(timerInterval);let score=0,total=0;const responses=[];assessment.questions.forEach((q,i)=>{const marks=Number(q.marks)||1;total+=marks;const ans=quiz.answers[q.id]||"";const ok=isAnswerCorrect(q,ans);if(ok)score+=marks;responses.push({number:i+1,question:q.text,type:q.type,options:q.options||[],answer:ans,answerDisplay:studentAnswerDisplay(q,ans),correct:q.correctAnswer,correctDisplay:correctAnswerDisplay(q),isCorrect:ok,marks});});const payload={studentName:quiz.studentName,assessmentId:assessment.id,slug:assessment.slug,assessmentTitle:assessment.title,type:"quiz",score,total,percentage:total?Math.round(score/total*100):0,timeTakenSeconds:Math.round((Date.now()-quiz.startedAt)/1000),submittedAt:new Date().toISOString(),responses};lastQuizResult=payload;saveAttempt({assessmentId:assessment.id,slug:assessment.slug,type:"quiz",title:assessment.title,score,total,percentage:payload.percentage,at:new Date().toISOString()});if(assessment.googleSheetsWebhook){try{await fetch(assessment.googleSheetsWebhook,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}catch(e){}}renderQuizResult(payload);}
function renderQuizResult(p){const can=assessment.viewer?.showCorrectAnswersAfterSubmit!==false;app.innerHTML=`<div class="quiz-card" style="text-align:center"><h1>Quiz Submitted</h1><p style="font-size:42px;font-weight:800">${p.score}/${p.total}</p><p class="muted">${p.percentage}%</p><div class="actions" style="justify-content:center">${can?`<button class="secondary" onclick="showAnswerReview()">Review Answers</button>`:""}<button class="primary" onclick="takeQuizAgain()">Take Quiz Again</button><a class="btn secondary" href="./">Dashboard</a></div></div>`;}
function showAnswerReview(){if(!lastQuizResult){alert("No quiz result available to review.");return;}app.innerHTML=`<div class="quiz-card"><h1>Answer Review</h1><div class="muted" style="margin-bottom:18px">Score: ${lastQuizResult.score}/${lastQuizResult.total} · ${lastQuizResult.percentage}%</div>${lastQuizResult.responses.map((r,i)=>`<div class="question" style="border-left:4px solid ${r.isCorrect?"#16a34a":"#dc2626"};padding-left:14px"><p><b>Q${i+1}.</b> ${esc(r.question)}</p>${r.options?.length?`<div class="options-list">${r.options.map((o,idx)=>`<div class="option-row"><b>${String.fromCharCode(65+idx)}.</b> ${esc(o)}</div>`).join("")}</div>`:""}<p>Your answer: <b>${esc(r.answerDisplay||"Not answered")}</b></p><p>Correct answer: <b>${esc(r.correctDisplay||r.correct||"Not provided")}</b></p><p style="font-weight:700;color:${r.isCorrect?"#16a34a":"#dc2626"}">${r.isCorrect?"Correct":"Incorrect"}</p></div>`).join("")}<div class="actions" style="justify-content:center"><button class="secondary" onclick="renderQuizResult(lastQuizResult)">Back to Score</button><button class="primary" onclick="takeQuizAgain()">Take Quiz Again</button></div></div>`;}

init();
// Register Service Worker
if ("serviceWorker" in navigator) {

    window.addEventListener("load", () => {

        navigator.serviceWorker.register("./sw.js")

            .then((registration) => {

                console.log("ABLE™ iAssess Service Worker registered.", registration);

            })

            .catch((err) => {

                console.error("Service Worker registration failed:", err);

            });

    });

}
