const $ = s => document.querySelector(s);
const app = $("#app");
let assessment = null;
let quiz = { index:0, answers:{}, startedAt:null, studentName:"" };
let timerInterval = null;
let remaining = 0;

function esc(str=""){
  return String(str).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function structureQuestion(q) {
  const originalText = q.text || "";
  let text = originalText.trim();

  if (q.type === "mcq" && Array.isArray(q.options) && q.options.length) return q;

  const mcqMatch = text.match(/^Multiple Choice:\s*(.*?)(?:\s+a\)\s+)(.*?)(?:\s+b\)\s+)(.*?)(?:\s+c\)\s+)(.*?)(?:\s+d\)\s+)(.*)$/i);

  if (mcqMatch) {
    return {
      ...q,
      type: "mcq",
      text: mcqMatch[1].trim(),
      options: [
        mcqMatch[2].trim(),
        mcqMatch[3].trim(),
        mcqMatch[4].trim(),
        mcqMatch[5].trim()
      ]
    };
  }

  if (/^Fill in the blank:/i.test(text)) {
    return {
      ...q,
      type: "fill_blank",
      text: text.replace(/^Fill in the blank:\s*/i, "").trim()
    };
  }

  if (/^True or False:/i.test(text)) {
    return {
      ...q,
      type: "true_false",
      text: text.replace(/^True or False:\s*/i, "").trim()
    };
  }

  if (/^Direct Question:/i.test(text)) {
    return {
      ...q,
      type: "short_answer",
      text: text.replace(/^Direct Question:\s*/i, "").trim()
    };
  }

  return {
    ...q,
    type: q.type || "long_answer"
  };
}

function formatQuestionText(text = "") {
  return esc(text)
    .replace(/\s+([a-dA-D]\))/g, "<br>$1")
    .replace(/\s+(\([a-dA-D]\))/g, "<br>$1")
    .replace(/\s+([A-D]\.)/g, "<br>$1")
    .replace(/\s+(Option\s+[A-D][:.)])/gi, "<br>$1");
}

function renderWrittenQuestion(q, index) {
  const normalized = structureQuestion(q);

  if (normalized.type === "mcq" && Array.isArray(normalized.options)) {
    return `
      <div class="question">
        <p>
          <b>Q${index + 1}.</b> ${esc(normalized.text)}
          <span class="muted">[${esc(normalized.marks)} marks]</span>
        </p>

        <div class="options-list">
          ${normalized.options.map((opt, i) => `
            <div class="option-row">
              <b>${String.fromCharCode(65 + i)}.</b> ${esc(opt)}
            </div>
          `).join("")}
        </div>

        ${normalized.responseLength ? `<p class="muted">Suggested response: ${esc(normalized.responseLength)}</p>` : ""}
      </div>
    `;
  }

  if (normalized.type === "true_false") {
    return `
      <div class="question">
        <p>
          <b>Q${index + 1}.</b> ${formatQuestionText(normalized.text)}
          <span class="muted">[${esc(normalized.marks)} marks]</span>
        </p>
        <p class="muted">Answer: True / False</p>
      </div>
    `;
  }

  return `
    <div class="question">
      <p>
        <b>Q${index + 1}.</b> ${formatQuestionText(normalized.text)}
        <span class="muted">[${esc(normalized.marks)} marks]</span>
      </p>
      ${normalized.responseLength ? `<p class="muted">Suggested response: ${esc(normalized.responseLength)}</p>` : ""}
    </div>
  `;
}

async function init(){
  const id = new URLSearchParams(location.search).get("id");
  if(!id){
    app.innerHTML = `<div class="error"><b>No assessment selected.</b><br>Use a link like <code>?id=assessment-file-name</code>.</div>`;
    return;
  }

  try{
    const res = await fetch(`./assessments/${encodeURIComponent(id)}.json`, { cache:"no-store" });
    if(!res.ok) throw new Error("not found");

    assessment = await res.json();
    document.title = assessment.title || "ABLE Assessment";

    if(assessment.type === "quiz") renderQuizStart();
    else renderWritten();
  } catch(e){
    app.innerHTML = `<div class="error"><b>Assessment not found.</b><br>Please check that <code>assessments/${esc(id)}.json</code> exists on the hosted student site.</div>`;
  }
}

function renderWritten(){
  const a = assessment;

  app.innerHTML = `
    <article>
      <div class="report-head">
        <img src="./logo.png" alt="ABLE" onerror="this.style.display='none'">
        <div>
          <div class="muted">ABLE Assessment Studio</div>
          <h1>${esc(a.title)}</h1>
          <div class="muted">
            ${[a.subject, a.className ? "Class " + a.className : "", a.chapterName, a.duration ? "Duration: " + a.duration : "", a.maximumMarks ? "Marks: " + a.maximumMarks : ""].filter(Boolean).map(esc).join(" · ")}
          </div>
        </div>
      </div>

      <div class="actions no-print">
        <button class="primary" onclick="startTimed()">Start Timed Assessment</button>
        <button class="secondary" onclick="window.print()">Download / Save PDF</button>
        <button class="secondary" onclick="window.print()">Print Paper</button>
      </div>

      <section>
        <h2>Instructions</h2>
        <ol>${(a.instructions||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
      </section>

      ${(a.sections||[]).map(s=>`
        <section>
          <h2>${esc(s.title)}</h2>
          ${(s.questions||[]).map((q,i)=>renderWrittenQuestion(q, i)).join("")}
        </section>
      `).join("")}

      <div class="actions no-print">
        <button class="primary" onclick="completeWritten()">Assessment Complete</button>
      </div>

      <div id="completeBox" class="no-print"></div>

      <div class="report-footer">
        © 2026 Abhyast Private Limited. ABLE™ and TAKECARE™ Registered Frameworks.
      </div>
    </article>`;
}

function startTimed(){
  const mins = Number(assessment.viewer?.durationMinutes) || parseInt(assessment.duration) || 40;
  remaining = mins * 60;
  $("#timer").style.display = "flex";
  tick();
  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function tick(){
  const m = Math.max(0, Math.floor(remaining/60));
  const s = Math.max(0, remaining%60);
  $("#timeText").textContent = String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
  remaining--;

  if(remaining < 0){
    clearInterval(timerInterval);
    alert("Time is up. Please submit your answer sheet.");
  }
}

function completeWritten(){
  clearInterval(timerInterval);

  const phone = String(assessment.submission?.whatsapp || "919910686080").replace(/\D/g,"");
  const msg = encodeURIComponent("I have completed: " + (assessment.title || "Assessment") + ". I am sending my answer sheet.");
  const drive = assessment.submission?.drive || "";

  $("#completeBox").innerHTML = `
    <div style="margin-top:20px;padding:20px;border:1px solid #e2e8f0;border-radius:16px;text-align:center">
      <h2>Assessment Complete</h2>
      <p class="muted">Submit your handwritten answer sheet offline.</p>
      <a class="btn success" href="https://wa.me/${phone}?text=${msg}" target="_blank">Submit via WhatsApp</a>
      ${drive ? `<a class="btn secondary" href="${esc(drive)}" target="_blank">Open Google Drive Folder</a>` : ""}
    </div>`;
}

function renderQuizStart(){
  app.innerHTML = `
    <div class="quiz-card">
      <div class="report-head">
        <img src="./logo.png" alt="ABLE" onerror="this.style.display='none'">
        <div>
          <div class="muted">ABLE Interactive Quiz</div>
          <h1>${esc(assessment.title)}</h1>
          <div class="muted">${esc(assessment.subject)} ${assessment.className ? "· Class " + esc(assessment.className) : ""}</div>
        </div>
      </div>

      <label>
        <b>Student Name</b>
        <input id="studentName" type="text" placeholder="Enter your name">
      </label>

      <div class="actions">
        <button class="primary" onclick="startQuiz()">Start Quiz</button>
      </div>
    </div>`;
}

function startQuiz(){
  quiz = {
    index:0,
    answers:{},
    startedAt:Date.now(),
    studentName:$("#studentName").value || "Student"
  };

  const mins = Number(assessment.viewer?.durationMinutes) || parseInt(assessment.duration) || 0;
  if(mins) startTimed();

  renderQuizCard();
}

function renderQuizCard(){
  const q = assessment.questions[quiz.index];
  const ans = quiz.answers[q.id] || "";

  app.innerHTML = `
    <div class="quiz-card">
      <div class="muted">Question ${quiz.index+1} of ${assessment.questions.length}</div>
      <h2>${esc(q.text)}</h2>

      <div>${quizInput(q, ans)}</div>

      <div class="actions" style="justify-content:space-between">
        <button class="secondary" onclick="prevQ()" ${quiz.index===0?"disabled":""}>Previous</button>
        ${quiz.index===assessment.questions.length-1
          ? `<button class="primary" onclick="submitQuiz()">Submit Quiz</button>`
          : `<button class="primary" onclick="nextQ()">Next</button>`}
      </div>
    </div>`;
}

function quizInput(q, ans){
  if(q.type==="fill_blank"){
    return `<input id="answer" type="text" value="${esc(ans)}" placeholder="Type answer">`;
  }

  const options = q.type==="true_false" ? ["TRUE","FALSE"] : q.options;

  return (options||[]).map((o,i)=>{
    const val = q.type==="true_false" ? o : String.fromCharCode(65+i);
    return `
      <label class="option">
        <input type="radio" name="answer" value="${esc(val)}" ${ans===val || ans===o ? "checked" : ""}>
        ${esc(o)}
      </label>`;
  }).join("");
}

function captureAnswer(){
  const q = assessment.questions[quiz.index];
  const input = q.type==="fill_blank" ? $("#answer") : document.querySelector('input[name="answer"]:checked');
  if(input) quiz.answers[q.id] = input.value;
}

function nextQ(){
  captureAnswer();
  quiz.index++;
  renderQuizCard();
}

function prevQ(){
  captureAnswer();
  quiz.index--;
  renderQuizCard();
}

async function submitQuiz(){
  captureAnswer();
  clearInterval(timerInterval);

  let score=0,total=0;
  const responses=[];

  assessment.questions.forEach(q=>{
    total += Number(q.marks)||1;
    const ans = quiz.answers[q.id] || "";
    const ok = String(ans).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase();

    if(ok) score += Number(q.marks)||1;

    responses.push({
      question:q.text,
      answer:ans,
      correct:q.correctAnswer,
      isCorrect:ok
    });
  });

  const payload = {
    studentName:quiz.studentName,
    assessmentTitle:assessment.title,
    score,
    total,
    percentage: total ? Math.round(score/total*100) : 0,
    submittedAt:new Date().toISOString(),
    responses
  };

  if(assessment.googleSheetsWebhook){
    try{
      await fetch(assessment.googleSheetsWebhook,{
        method:"POST",
        mode:"no-cors",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
    }catch(e){}
  }

  app.innerHTML = `
    <div class="quiz-card" style="text-align:center">
      <h1>Quiz Submitted</h1>
      <p style="font-size:42px;font-weight:800">${score}/${total}</p>
      <p class="muted">${payload.percentage}%</p>
    </div>`;
}

init();
