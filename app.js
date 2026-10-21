const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = iso => new Date(iso).toLocaleString("ko-KR", {year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});

// 구글에서 돌아왔을 때 주소창 정리 + 거절된 계정 안내
let loginNotice = "";
(function readReturn() {
  const q = new URLSearchParams(location.search + "&" + location.hash.replace(/^#/, ""));
  const err = q.get("error_description") || q.get("error");
  if (err) loginNotice = /Database error|허용되지/.test(err) ? "이 계정은 들어올 수 없어요. 허용된 구글 계정으로 로그인해 주세요." : "로그인하지 못했어요: " + err;
})();

async function route() {
  const user = await Data.currentUser();
  if (location.search) history.replaceState(null, "", location.pathname + (location.hash.startsWith("#error") ? "" : location.hash));
  if (loginNotice && !user) { $("#loginError").textContent = loginNotice; $("#loginError").hidden = false; }
  let [view, id] = location.hash.replace("#","").split("/");
  if (!["login","upload","minutes"].includes(view)) view = "";
  if (!user) view = "login";
  else if (!view || view === "login") view = "upload";

  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-" + view).hidden = false;
  $("#tabs").hidden = $("#userBox").hidden = !user;
  if (user) $("#userEmail").textContent = user.email;
  document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === view));
  if (view === "minutes") renderMinutes(id);
}

async function renderMinutes(id) {
  try { await renderMinutesInner(id); }
  catch (err) { $("#detail").innerHTML = `<p class="error">불러오지 못했어요: ${esc(err.message || err)}</p>`; }
}
async function renderMinutesInner(id) {
  const list = await Data.listMinutes();
  if (!id && list.length) id = list[0].id;
  $("#minuteList").innerHTML = list.length ? list.map(m =>
    `<li><a href="#minutes/${m.id}" class="${m.id===id?"on":""}">${esc(m.title)}<small>${fmt(m.created_at)}${m.status==="done"?"":" · 만드는 중"}</small></a></li>`
  ).join("") : `<li class="empty">아직 회의록이 없어요</li>`;
  const m = id ? await Data.getMinute(id) : null;
  if (m && m.status !== "done") {
    $("#detail").innerHTML = `<h2>${esc(m.title)}</h2><div class="meta"><span>${fmt(m.created_at)}</span></div>
      <p class="empty">${m.status === "error" ? "회의록을 만들다 문제가 생겼어요: " + esc(m.error) : "녹음은 저장됐어요. 회의록을 만드는 중이에요."}</p>
      <button class="btn-primary" id="retryBtn">회의록 다시 만들기</button>`;
    $("#retryBtn").onclick = async () => {
      $("#retryBtn").disabled = true; $("#retryBtn").textContent = "만드는 중… (1~2분)";
      try { await Data.makeMinutes(m.id); } catch (e) {}
      renderMinutes(m.id);
    };
    return;
  }
  $("#detail").innerHTML = !m ? `<p class="empty">녹음을 올리면 회의록이 여기에 보여요.</p>` : `
    <h2>${esc(m.title)}</h2>
    <div class="meta"><span>${fmt(m.created_at)}</span>${m.mailed ? `<span class="badge">메일 발송 완료</span>` : ""}</div>
    ${!m.mailed && m.error ? `<p class="error">${esc(m.error)}</p>` : ""}
    <h3>요약</h3><p>${esc(m.summary)}</p>
    <h3>결정사항</h3><ul>${(m.decisions||[]).map(d=>`<li>${esc(d)}</li>`).join("")}</ul>
    <h3>할 일</h3><ul>${(m.todos||[]).map(d=>`<li>${esc(d)}</li>`).join("")}</ul>
    ${m.transcript ? `<details class="transcript"><summary>녹음 전체 글 보기</summary><pre>${esc(m.transcript)}</pre></details>` : ""}`;
}

// 업로드 화면
let picked = null;
function pick(file) {
  picked = file;
  $("#dropText").textContent = file ? `선택됨: ${file.name}` : "여기를 눌러 파일 고르기";
  $("#startBtn").disabled = !file;
  if (file && !$("#titleInput").value) $("#titleInput").value = file.name.replace(/\.[^.]+$/, "");
}
$("#fileInput").addEventListener("change", e => pick(e.target.files[0]));
const drop = $("#drop");
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); pick(e.dataTransfer.files[0]); });

$("#startBtn").addEventListener("click", async () => {
  if (!picked) return;
  $("#startBtn").disabled = true;
  $("#doneBox").hidden = $("#errorBox").hidden = true;
  const steps = [...document.querySelectorAll("#steps li")];
  steps.forEach(li => li.className = "");
  $("#steps").hidden = false;
  try {
    const m = await Data.createFromAudio(picked, $("#titleInput").value.trim(), step => {
      let passed = true;
      steps.forEach(li => {
        if (li.dataset.step === step || (step === "transcribe" && li.dataset.step !== "upload")) { li.className = "doing"; passed = false; }
        else li.className = passed ? "ok" : "";
      });
    });
    steps.forEach(li => li.className = "ok");
    if (!m.mailed) steps[3].className = "fail";
    $("#doneMsg").textContent = m.mailed ? "✅ 회의록이 만들어졌고 메일로 보냈어요." : "✅ 회의록은 만들어졌어요. ⚠️ " + (m.error || "메일은 보내지 못했어요");
    $("#openResult").href = "#minutes/" + m.id;
    $("#doneBox").hidden = false;
    pick(null); $("#fileInput").value = ""; $("#titleInput").value = "";
  } catch (err) {
    $("#errorBox").textContent = "문제가 생겼어요:\n" + (err.message || err);
    $("#errorBox").hidden = false;
    $("#startBtn").disabled = false;
  }
});

$("#loginBtn").addEventListener("click", async () => {
  try { await Data.login(); location.hash = "#upload"; route(); }
  catch (err) { $("#loginError").textContent = "로그인하지 못했어요: " + (err.message || err); $("#loginError").hidden = false; }
});
$("#logoutBtn").addEventListener("click", async () => { await Data.logout(); location.hash = "#login"; route(); });
window.addEventListener("hashchange", route);
route();
