fetch('/api/stats').then(r=>r.json()).then(s=>{
document.getElementById('statQuizzes').textContent=s.totalQuizzes;
document.getElementById('statTakes').textContent=s.totalTakes;
}).catch(()=>{});
