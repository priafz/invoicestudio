/* ============================================
   Priafz Invoice Studio — shared utilities
   Used by every page to avoid duplicated logic.
   ============================================ */
window.App = (function(){

  function $(id){ return document.getElementById(id); }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escapeAttr(s){
    return String(s == null ? '' : s).replace(/"/g,'&quot;');
  }

  // ---------- CSV ----------
  function csvEscape(val){
    const s = String(val === undefined || val === null ? '' : val);
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }
  function toCSV(list, columns, jsonColumns){
    jsonColumns = jsonColumns || [];
    const rows = [columns.join(',')];
    list.forEach(obj => {
      const row = columns.map(col => {
        if(jsonColumns.indexOf(col) !== -1) return csvEscape(JSON.stringify(obj[col] || []));
        return csvEscape(obj[col]);
      });
      rows.push(row.join(','));
    });
    return rows.join('\r\n');
  }
  function parseCSV(text){
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else { inQuotes = false; } }
        else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ',') { row.push(field); field = ''; }
        else if(c === '\r') { /* skip */ }
        else if(c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
  }
  function downloadCSV(csv, filename){
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function fmtDate(iso){
    if(!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if(isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  }

  // ---------- toast ----------
  let toastTimer = null;
  function showToast(message, type){
    let el = document.getElementById('appToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'appToast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'app-toast' + (type === 'error' ? ' error' : '');
    void el.offsetWidth; // restart animation
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ---------- modal ----------
  function openModal(id){ const m = $(id); if(m) m.classList.add('open'); }
  function closeModal(id){ const m = $(id); if(m) m.classList.remove('open'); }
  function wireModal(modalId, cancelId, confirmId, onConfirm){
    const modal = $(modalId);
    if(!modal) return;
    $(cancelId).addEventListener('click', () => closeModal(modalId));
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(modalId); });
    $(confirmId).addEventListener('click', () => { onConfirm(); closeModal(modalId); });
  }

  return {
    $, escapeHtml, escapeAttr,
    csvEscape, toCSV, parseCSV, downloadCSV, todayISO, fmtDate,
    showToast, openModal, closeModal, wireModal,
  };
})();
