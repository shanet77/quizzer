const R = document.getElementById('results');
const Q = document.getElementById('qs');

function resultBlock(i) {
  const d = document.createElement('div');
  d.className = 'rblock';
  d.innerHTML = `<strong>Result ${i+1}</strong><input data-r="title" maxlength="80" placeholder="e.g. Chaotic Raccoon" required><textarea data-r="description" maxlength="280" rows="2" placeholder="You hoard snacks and drama."></textarea><input data-r="imageUrl" placeholder="https://… image (optional)">`;
  return d;
}
function questionBlock(i) {
  const d = document.createElement('div');
  d.className = 'qblock';
  d.innerHTML = `<strong>Question ${i+1}</strong><input data-q="text" maxlength="200" placeholder="Pick a Friday night…" required><div data-opts></div><button type="button" class="btn-ghost" data-addopt>+ option</button>`;
  const holder = d.querySelector('[data-opts]');
  holder.append(optionBlock(), optionBlock(), optionBlock());
  d.querySelector('[data-addopt]').onclick = () => {
    if (holder.children.length >= 4) return;
    holder.append(optionBlock());
    refreshLabels();
  };
  return d;
}
function optionBlock() {
  const d = document.createElement('div');
  d.className = 'oblock';
  d.innerHTML = `<input data-o="text" maxlength="80" placeholder="Option text" required><input data-o="imageUrl" placeholder="https://… image (optional)"><label>Points to result <select data-o="resultIndex"></select></label>`;
  return d;
}
function refreshLabels() {
  const nR = R.children.length;
  [...Q.children].forEach((qb, qi) => {
    qb.querySelector('strong').textContent = `Question ${qi+1}`;
    [...qb.querySelectorAll('[data-o="resultIndex"]')].forEach(sel => {
      const cur = sel.value;
      sel.innerHTML = '';
      for (let i = 0; i < nR; i++) {
        const o = document.createElement('option');
        o.value = i; o.textContent = `Result ${i+1}`;
        sel.append(o);
      }
      if (cur !== '') sel.value = cur;
    });
  });
  [...R.children].forEach((rb, i) => rb.querySelector('strong').textContent = `Result ${i+1}`);
}
document.getElementById('addR').onclick = () => {
  if (R.children.length >= 4) return;
  R.append(resultBlock(R.children.length));
  refreshLabels();
};
document.getElementById('addQ').onclick = () => {
  if (Q.children.length >= 8) return;
  Q.append(questionBlock(Q.children.length));
  refreshLabels();
};
R.append(resultBlock(0), resultBlock(1));
Q.append(questionBlock(0), questionBlock(1));
refreshLabels();

document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.hidden = true;
  const fd = new FormData(e.target);
  const results = [...R.children].map(rb => ({
    title: rb.querySelector('[data-r="title"]').value,
    description: rb.querySelector('[data-r="description"]').value,
    imageUrl: rb.querySelector('[data-r="imageUrl"]').value.trim()
  }));
  const questions = [...Q.children].map(qb => ({
    text: qb.querySelector('[data-q="text"]').value,
    options: [...qb.querySelectorAll('.oblock')].map(ob => ({
      text: ob.querySelector('[data-o="text"]').value,
      imageUrl: ob.querySelector('[data-o="imageUrl"]').value.trim(),
      resultIndex: Number(ob.querySelector('[data-o="resultIndex"]').value)
    }))
  }));
  const payload = { title: fd.get('title'), description: fd.get('description'), website: fd.get('website'), results, questions };
  let res;
  try {
    const isEdit = location.hash.startsWith('#edit=');
    const editId = new URLSearchParams(location.search).get('id');
    if (isEdit && editId) {
      const token = location.hash.slice(6);
      res = await fetch(`/api/quizzes/${editId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, editToken: token }) });
    } else {
      res = await fetch('/api/quizzes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    }
  } catch { err.textContent = 'Network error'; err.hidden = false; return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { err.textContent = data.error || 'Something broke'; err.hidden = false; return; }
  if (data.url) {
    const done = document.getElementById('done');
    done.hidden = false;
    const link = location.origin + data.url;
    const a = document.getElementById('share');
    a.href = data.url; a.textContent = link;
    document.getElementById('edit').textContent = `${location.origin}/create?id=${data.id}#edit=${data.editToken}`;
    document.getElementById('copy').onclick = () => navigator.clipboard.writeText(link);
    window.scrollTo(0, document.body.scrollHeight);
  } else { location.href = `/q/${new URLSearchParams(location.search).get('id')}`; }
};
