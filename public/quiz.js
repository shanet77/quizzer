const app = document.getElementById('app');
const id = location.pathname.split('/').pop();
let quiz, step = 0, scores = {};

function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

fetch(`/api/quizzes/${encodeURIComponent(id)}`).then(async r => {
  if (!r.ok) throw 0;
  quiz = await r.json();
  renderQ();
}).catch(() => { app.innerHTML = `<h1>This quiz wandered off</h1><p>It may have been deleted. <a href="/">Back home</a></p>`; });

function renderQ() {
  if (step >= quiz.questions.length) return renderResult();
  const q = quiz.questions[step];
  const pct = Math.round(step / quiz.questions.length * 100);
  app.innerHTML = `<p class="kicker">${esc(quiz.title)}</p><h1>${esc(q.text)}</h1>
  <div class="prog"><i style="width:${pct}%"></i></div>
  <div id="opts"></div>`;
  const box = document.getElementById('opts');
  q.options.forEach(o => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.innerHTML = `${esc(o.text)}${o.imageUrl ? `<br><img class="qimg" src="${esc(o.imageUrl)}" loading="lazy">` : ''}`;
    b.onclick = () => { scores[o.resultId] = (scores[o.resultId]||0)+1; step++; renderQ(); };
    box.append(b);
  });
}

function renderResult() {
  let best = quiz.results[0], bestN = -1;
  for (const r of quiz.results) {
    const n = scores[r.id] || 0;
    if (n > bestN) { bestN = n; best = r; }
  }
  fetch(`/api/quizzes/${encodeURIComponent(id)}/take`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resultId: best.id }) }).catch(()=>{});
  app.innerHTML = `<p class="kicker">Your result</p>
  <div class="result"><div class="big">${best.imageUrl ? `<img class="qimg" src="${esc(best.imageUrl)}">` : '✳'}</div>
  <h1>You are: ${esc(best.title)}</h1>
  <p>${esc(best.description)}</p>
  <div class="share-row"><button class="btn-ghost" id="cp">Copy link</button><a class="btn-ghost" href="/create">Make your own</a></div>
  <p class="muted">Takes so far: ${quiz.takes + 1}</p></div>`;
  document.getElementById('cp').onclick = () => navigator.clipboard.writeText(location.href);
}
