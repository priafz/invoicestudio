(function(){
  const { $, escapeHtml, escapeAttr, todayISO } = window.App;
  const STORAGE_KEY = 'ledger_invoices_v1';
  const SETTINGS_KEY = 'ledger_settings_v1';
  const PRODUCTS_KEY = 'ledger_products_v1';
  const CLIENTS_KEY = 'ledger_clients_v1';
  let lineIdCounter = 0;
  let currentId = null;

  const fields = ['fromName','fromAddress','fromEmail','fromPhone','toName','toAddress','toEmail','toPhone','invNum','invStatus','invDate','invDue','invNotes'];

  function getSettings(){
    try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }catch(e){ return {}; }
  }

  function getProducts(){
    try{ return JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || []; }catch(e){ return []; }
  }
  function getClients(){
    try{ return JSON.parse(localStorage.getItem(CLIENTS_KEY)) || []; }catch(e){ return []; }
  }
  function buildClientOptions(){
    const clients = getClients().slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
    let html = '<option value="">— Choose a client or enter manually below —</option>';
    clients.forEach(c => { html += `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`; });
    return html;
  }
  function applyClient(clientId){
    if(!clientId) return;
    const client = getClients().find(c => c.id === clientId);
    if(!client) return;
    $('toName').value = client.name || '';
    $('toAddress').value = client.address || '';
    $('toEmail').value = client.email || '';
    $('toPhone').value = client.phone || '';
    renderPreview();
  }

  // ---------- line items ----------
  function buildProductOptions(){
    const products = getProducts().slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
    let opts = '<option value="">— Custom item —</option>';
    products.forEach(p => {
      opts += `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}${p.price ? ' (' + fmtMoney(p.price) + ')' : ''}</option>`;
    });
    return opts;
  }

  function newLine(desc='', qty=1, rate=0){
    lineIdCounter++;
    const id = 'li_' + lineIdCounter;
    const wrap = document.createElement('div');
    wrap.className = 'line-item';
    wrap.dataset.id = id;
    wrap.innerHTML = `
      <button class="remove-line" type="button" aria-label="Remove line item">&times;</button>
      <div class="field-group" style="margin-bottom:10px;">
        <label>From catalog</label>
        <select class="li-product">${buildProductOptions()}</select>
      </div>
      <div class="field-group" style="margin-bottom:10px;">
        <label>Description</label>
        <input class="li-desc" value="${escapeAttr(desc)}" placeholder="Product/Services">
      </div>
      <div class="field-row">
        <div>
          <label>Qty</label>
          <input class="li-qty" type="number" min="0" step="1" value="${qty}">
        </div>
        <div>
          <label>Rate</label>
          <input class="li-rate" type="number" min="0" step="0.01" value="${rate}">
        </div>
      </div>
    `;
    wrap.querySelector('.remove-line').addEventListener('click', () => { wrap.remove(); renderPreview(); });
    wrap.querySelector('.li-product').addEventListener('change', (e) => {
      const productId = e.target.value;
      if(!productId) return;
      const product = getProducts().find(p => p.id === productId);
      if(!product) return;
      wrap.querySelector('.li-desc').value = product.description ? `${product.name} — ${product.description}` : product.name;
      wrap.querySelector('.li-rate').value = product.price || 0;
      renderPreview();
    });
    wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', renderPreview));
    return wrap;
  }
  function addLine(desc, qty, rate){ $('lineItems').appendChild(newLine(desc, qty, rate)); renderPreview(); }
  function getLineItems(){
    return Array.from(document.querySelectorAll('.line-item')).map(el => ({
      desc: el.querySelector('.li-desc').value,
      qty: parseFloat(el.querySelector('.li-qty').value) || 0,
      rate: parseFloat(el.querySelector('.li-rate').value) || 0,
    }));
  }

  // ---------- signature pads ----------
  const sigPads = {}; // id -> {canvas, ctx, drawing, empty}

  function setupSigPad(canvasId){
    const canvas = $(canvasId);
    const ratio = window.devicePixelRatio || 1;
    function resize(){
      const rect = canvas.getBoundingClientRect();
      const prevData = sigPads[canvasId] && !sigPads[canvasId].empty ? canvas.toDataURL() : null;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1B2430';
      sigPads[canvasId].ctx = ctx;
      if(prevData){
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = prevData;
      }
    }
    sigPads[canvasId] = {canvas, ctx:null, drawing:false, empty:true};
    resize();
    window.addEventListener('resize', resize);

    function pos(e){
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return {x: t.clientX - rect.left, y: t.clientY - rect.top};
    }
    function start(e){
      e.preventDefault();
      sigPads[canvasId].drawing = true;
      sigPads[canvasId].empty = false;
      const p = pos(e);
      sigPads[canvasId].ctx.beginPath();
      sigPads[canvasId].ctx.moveTo(p.x, p.y);
    }
    function move(e){
      if(!sigPads[canvasId].drawing) return;
      e.preventDefault();
      const p = pos(e);
      sigPads[canvasId].ctx.lineTo(p.x, p.y);
      sigPads[canvasId].ctx.stroke();
    }
    function end(){ sigPads[canvasId].drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, {passive:false});
    canvas.addEventListener('touchmove', move, {passive:false});
    canvas.addEventListener('touchend', end);
  }

  function clearSigPad(canvasId){
    const p = sigPads[canvasId];
    if(!p) return;
    p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    p.empty = true;
    renderPreview();
  }

  function getSigDataURL(canvasId){
    const p = sigPads[canvasId];
    if(!p || p.empty) return '';
    return p.canvas.toDataURL('image/png');
  }

  function loadSigDataURL(canvasId, dataURL){
    const p = sigPads[canvasId];
    if(!p) return;
    p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    p.empty = !dataURL;
    if(dataURL){
      const img = new Image();
      img.onload = () => {
        const rect = p.canvas.getBoundingClientRect();
        p.ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = dataURL;
    }
  }

  // ---------- template selection ----------
  let currentTemplate = 'ledger';
  function setTemplate(t){
    currentTemplate = t;
    $('sheet').setAttribute('data-template', t);
    document.querySelectorAll('.template-swatch').forEach(el => {
      el.classList.toggle('active', el.dataset.template === t);
    });
  }
  $('templateOptions').addEventListener('click', (e) => {
    const el = e.target.closest('.template-swatch');
    if(!el) return;
    setTemplate(el.dataset.template);
  });

  // ---------- money / dates ----------
  function fmtMoney(n){
    const cur = getSettings().currency || '$';
    return cur + Number(n||0).toFixed(2);
  }
  const fmtDate = window.App.fmtDate;
  function joinNonEmpty(arr, sep){ return arr.filter(Boolean).join(sep); }

  // ---------- preview ----------
  function renderPreview(){
    const settings = getSettings();

    $('pFromName').textContent = $('fromName').value || settings.businessName || 'Your Business Name';
    const fromMetaLines = [$('fromAddress').value, joinNonEmpty([$('fromEmail').value, $('fromPhone').value], '  ·  ')].filter(Boolean);
    $('pFromMeta').innerHTML = fromMetaLines.length ? fromMetaLines.map(escapeHtml).join('<br>') : 'Address line<br>email@example.com';

    const logoEl = $('pLogo');
    if(settings.logo){
      logoEl.src = settings.logo;
      logoEl.classList.add('show');
    } else {
      logoEl.classList.remove('show');
    }

    $('pToName').textContent = $('toName').value || 'Client name';
    const toMetaLines = [$('toAddress').value, joinNonEmpty([$('toEmail').value, $('toPhone').value], '  ·  ')].filter(Boolean);
    $('pToContact').innerHTML = toMetaLines.map(escapeHtml).join('<br>');

    $('pInvNum').textContent = $('invNum').value || '0001';
    $('pInvDate').textContent = 'Issued ' + fmtDate($('invDate').value || todayISO());
    $('pDueDate').textContent = fmtDate($('invDue').value);

    const status = $('invStatus').value;
    const stampEl = $('pStatus');
    stampEl.classList.remove('paid','blank');
    if(status === 'paid'){ stampEl.textContent = 'Paid'; stampEl.classList.add('paid'); }
    else if(status === 'blank'){ stampEl.textContent = ''; stampEl.classList.add('blank'); }
    else { stampEl.textContent = 'Due'; }

    const items = getLineItems();
    const tbody = $('pItems');
    tbody.innerHTML = '';
    let subtotal = 0;
    items.forEach(it => {
      const amount = it.qty * it.rate;
      subtotal += amount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="item-desc-name">${escapeHtml(it.desc || 'Untitled item')}</div></td>
        <td class="num">${it.qty}</td>
        <td class="num">${fmtMoney(it.rate)}</td>
        <td class="num">${fmtMoney(amount)}</td>
      `;
      tbody.appendChild(tr);
    });
    if(items.length === 0){
      tbody.innerHTML = `<tr><td colspan="4" style="color:var(--ink-soft); font-style:italic;">No line items yet — add one on the left.</td></tr>`;
    }

    $('pSubtotal').textContent = fmtMoney(subtotal);
    $('pTotal').textContent = fmtMoney(subtotal);

    const notes = $('invNotes').value;
    $('pNotesWrap').style.display = notes ? '' : 'none';
    $('pNotes').textContent = notes;

    // signatures
    const showSig = $('showSignatures').checked;
    $('signatureFields').classList.toggle('hidden-section', !showSig);
    const pSignGrid = document.querySelector('.sign-grid');
    if(pSignGrid) pSignGrid.style.display = showSig ? '' : 'none';
    const bizSig = getSigDataURL('sigBusiness') || settings.signature || '';
    const cliSig = getSigDataURL('sigClient') || '';
    updateSigPreview('pSigBusiness', 'pSigBusinessPlaceholder', bizSig);
    updateSigPreview('pSigClient', 'pSigClientPlaceholder', cliSig);
    $('pSigBusinessName').textContent = $('fromName').value || settings.businessName || '';
    $('pSigClientName').textContent = $('toName').value || '';
  }

  function updateSigPreview(imgId, placeholderId, dataURL){
    const img = $(imgId);
    const ph = $(placeholderId);
    if(dataURL){
      img.src = dataURL;
      img.style.display = '';
      ph.style.display = 'none';
    } else {
      img.style.display = 'none';
      ph.style.display = '';
    }
  }

  // ---------- collect / load ----------
  function collectData(){
    return {
      id: currentId || ('inv_' + Date.now()),
      fromName: $('fromName').value,
      fromAddress: $('fromAddress').value,
      fromEmail: $('fromEmail').value,
      fromPhone: $('fromPhone').value,
      toName: $('toName').value,
      toAddress: $('toAddress').value,
      toEmail: $('toEmail').value,
      toPhone: $('toPhone').value,
      invNum: $('invNum').value,
      invStatus: $('invStatus').value,
      invDate: $('invDate').value,
      invDue: $('invDue').value,
      invNotes: $('invNotes').value,
      template: currentTemplate,
      showSignatures: $('showSignatures').checked,
      sigBusiness: getSigDataURL('sigBusiness'),
      sigClient: getSigDataURL('sigClient'),
      items: getLineItems(),
      savedAt: Date.now(),
    };
  }

  function loadData(data){
    currentId = data.id;
    $('fromName').value = data.fromName || '';
    $('fromAddress').value = data.fromAddress || '';
    $('fromEmail').value = data.fromEmail || '';
    $('fromPhone').value = data.fromPhone || (data.fromMeta || '');
    $('toName').value = data.toName || '';
    $('toAddress').value = data.toAddress || '';
    $('toEmail').value = data.toEmail || '';
    $('toPhone').value = data.toPhone || '';
    $('invNum').value = data.invNum || '';
    $('invStatus').value = data.invStatus || 'due';
    $('invDate').value = data.invDate || '';
    $('invDue').value = data.invDue || '';
    $('invNotes').value = data.invNotes || '';
    setTemplate(data.template || 'ledger');
    $('lineItems').innerHTML = '';
    (data.items && data.items.length ? data.items : [{desc:'',qty:1,rate:0}]).forEach(it => {
      $('lineItems').appendChild(newLine(it.desc, it.qty, it.rate));
    });
    loadSigDataURL('sigBusiness', data.sigBusiness || '');
    loadSigDataURL('sigClient', data.sigClient || '');
    $('showSignatures').checked = data.showSignatures !== undefined ? !!data.showSignatures : true;
    renderPreview();
  }

  // ---------- persistence ----------
  function getSaved(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }catch(e){ return []; }
  }
  function setSaved(list){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

  function saveCurrent(){
    const data = collectData();
    currentId = data.id;
    const list = getSaved().filter(x => x.id !== data.id);
    list.push(data);
    setSaved(list);
    return data;
  }

  function resetForm(){
    currentId = null;
    const settings = getSettings();
    $('fromName').value = settings.businessName || '';
    $('fromAddress').value = settings.address || '';
    $('fromEmail').value = settings.email || '';
    $('fromPhone').value = settings.phone || '';
    $('toName').value = '';
    $('toAddress').value = '';
    $('toEmail').value = '';
    $('toPhone').value = '';
    $('invNum').value = String(getSaved().length + 1).padStart(4,'0');
    $('invStatus').value = 'due';
    $('invDate').value = todayISO();
    $('invDue').value = '';
    $('invNotes').value = 'Payment due within 14 days. Thank you for your business.';
    $('showSignatures').checked = true;
    setTemplate('ledger');
    $('lineItems').innerHTML = '';
    addLine('', 1, 0);
    clearSigPad('sigBusiness');
    clearSigPad('sigClient');
    if(settings.signature) loadSigDataURL('sigBusiness', settings.signature);
    renderPreview();
  }

  // ---------- wire up ----------
  fields.forEach(id => $(id).addEventListener('input', renderPreview));
  $('showSignatures').addEventListener('change', renderPreview);
  $('addLine').addEventListener('click', () => addLine('', 1, 0));
  $('saveBtn').addEventListener('click', saveCurrent);
  $('newBtn').addEventListener('click', resetForm);
  $('saveAndPrintBtn').addEventListener('click', () => {
    const data = saveCurrent();
    window.location.href = 'print.html?id=' + encodeURIComponent(data.id);
  });
  document.querySelectorAll('[data-clear-sig]').forEach(btn => {
    btn.addEventListener('click', () => clearSigPad(btn.dataset.clearSig));
  });

  setupSigPad('sigBusiness');
  setupSigPad('sigClient');

  $('clientSelect').innerHTML = buildClientOptions();
  $('clientSelect').addEventListener('change', (e) => applyClient(e.target.value));

  const initParams = new URLSearchParams(window.location.search);
  const editId = initParams.get('id');
  const existing = editId ? getSaved().find(x => x.id === editId) : null;
  if(existing){
    loadData(existing);
  } else {
    resetForm();
  }
})();
