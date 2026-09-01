// ============ Vanilla ZIP writer (store method, no compression library needed) ============

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const day = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0x0F) << 5) | (date.getDate() & 0x1F);
  return { time, day };
}

async function buildZip(files) {
  // files: array of { name: string, data: Uint8Array }
  const { time: dosTime, day: dosDate } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const centralDirOffset = offset;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

// ============ Helpers ============

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function baseName(filename) {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============ State ============

const state = { entries: [] };
let idCounter = 0;

// ============ DOM refs ============

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewBar = document.getElementById('previewBar');
const previewThumbsEl = document.getElementById('previewThumbs');
const previewCountEl = document.getElementById('previewCount');
const addMoreBtn = document.getElementById('addMoreBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const fileListEl = document.getElementById('fileList');
const summaryEl = document.getElementById('summary');
const formatSelect = document.getElementById('formatSelect');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValueLabel = document.getElementById('qualityValueLabel');
const qualityGroup = document.getElementById('qualityGroup');
const qualitySectionLabel = document.getElementById('qualitySectionLabel');
const targetGroup = document.getElementById('targetGroup');
const targetSizeInput = document.getElementById('targetSizeInput');
const targetUnitSelect = document.getElementById('targetUnitSelect');
const maxWidthInput = document.getElementById('maxWidthInput');
const processAllBtn = document.getElementById('processAllBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const pngNote = document.getElementById('pngNote');
const estimateBox = document.getElementById('estimateBox');
const estimateValueEl = document.getElementById('estimateValue');
const estimateReductionEl = document.getElementById('estimateReduction');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressStatusText = document.getElementById('progressStatusText');
const resultsPanel = document.getElementById('resultsPanel');
const resultsCountEl = document.getElementById('resultsCount');
const resultsOriginalEl = document.getElementById('resultsOriginal');
const resultsFinalEl = document.getElementById('resultsFinal');
const resultsPctEl = document.getElementById('resultsPct');
const compressAgainBtn = document.getElementById('compressAgainBtn');
const addMoreResultsBtn = document.getElementById('addMoreResultsBtn');
const dropZoneHeadline = document.getElementById('dropZoneHeadline');
const uploadConfirmEl = document.getElementById('uploadConfirm');
const progressFileText = document.getElementById('progressFileText');
const estimateOriginalEl = document.getElementById('estimateOriginal');

const DROP_ZONE_IDLE_HTML = 'Drop images here, or <span class="browse-link">browse files</span>';
const DROP_ZONE_DRAGOVER_TEXT = 'Release to add images';

// Controls disabled while a batch is processing
const lockableControls = [
  formatSelect, maxWidthInput, qualitySlider, targetSizeInput, targetUnitSelect,
  addMoreBtn, clearAllBtn
];
function setControlsLocked(locked) {
  lockableControls.forEach((el) => { el.disabled = locked; });
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.disabled = locked; });
  dropZone.style.pointerEvents = locked ? 'none' : '';
  if (!locked) {
    // Re-apply the PNG/target-mode restriction now that controls are unlocked again.
    const targetRadio = document.querySelector('input[name="mode"][value="target"]');
    targetRadio.disabled = formatSelect.value === 'png';
  }
}

// ============ Adding files ============

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const id = 'f' + idCounter++;
    const entry = {
      id, file, name: file.name, originalSize: file.size, img: null, error: false,
      compressedBlob: null, compressedSize: null, outFormat: null,
      outWidth: null, outHeight: null, compareUrl: null, status: 'ready'
    };
    state.entries.push(entry);
    renderFileRow(entry);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        entry.img = img;
        renderFileRow(entry);
        updatePreviewBar();
        updateProcessButtonState();
        scheduleEstimate();
      };
      img.onerror = () => {
        entry.error = true;
        renderFileRow(entry);
        updateProcessButtonState();
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      entry.error = true;
      renderFileRow(entry);
      updateProcessButtonState();
    };
    reader.readAsDataURL(file);
  });
  updateProcessButtonState();
  updateSummary();
  updateDropZoneVisibility();
  updatePreviewBar();
  flashUploadConfirm();
}

function flashUploadConfirm() {
  uploadConfirmEl.classList.add('show');
  clearTimeout(flashUploadConfirm._timer);
  flashUploadConfirm._timer = setTimeout(() => uploadConfirmEl.classList.remove('show'), 1200);
}

function removeEntry(id) {
  const entry = state.entries.find((en) => en.id === id);
  if (entry && entry.compareUrl) URL.revokeObjectURL(entry.compareUrl);
  state.entries = state.entries.filter((en) => en.id !== id);
  const row = document.getElementById('row-' + id);
  if (row) row.remove();
  updateSummary();
  updateProcessButtonState();
  updateDropZoneVisibility();
  updatePreviewBar();
  scheduleEstimate();
  if (state.entries.length === 0) {
    resultsPanel.classList.remove('visible');
    downloadZipBtn.disabled = true;
  }
}

// ============ Rendering ============

function renderFileRow(entry) {
  let row = document.getElementById('row-' + entry.id);
  if (!row) {
    row = document.createElement('div');
    row.className = 'file-row';
    row.id = 'row-' + entry.id;
    fileListEl.appendChild(row);
  }

  if (entry.error) {
    row.className = 'file-row';
    row.innerHTML = `
      <div class="file-info">
        <p class="file-name">${escapeHtml(entry.name)}</p>
        <p class="file-error">Couldn't read this image — try a different file.</p>
      </div>
      <div class="file-actions">
        <button class="row-remove" data-id="${entry.id}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>
      </div>
    `;
    return;
  }

  row.className = 'file-row';
  const thumbSrc = entry.img ? entry.img.src : '';
  const compressedText = entry.compressedSize != null ? fmtBytes(entry.compressedSize) : '—';
  const savedPct = entry.compressedSize != null && entry.originalSize > 0
    ? Math.max(0, Math.round((1 - entry.compressedSize / entry.originalSize) * 100))
    : null;
  const hasResult = !!entry.compressedBlob;
  const statusLabels = { ready: 'Ready', processing: 'Compressing…', done: 'Done' };
  const statusText = statusLabels[entry.status] || 'Ready';

  row.innerHTML = `
    ${thumbSrc ? `<img class="thumb" src="${thumbSrc}" alt="">` : '<div class="thumb thumb-loading"></div>'}
    <div class="file-info">
      <p class="file-name">${escapeHtml(entry.name)}</p>
      <p class="file-sizes">
        <span class="size-before">${fmtBytes(entry.originalSize)}</span>
        <span class="arrow">→</span>
        <span class="size-after">${compressedText}</span>
        ${savedPct !== null ? `<span class="saved-pct">−${savedPct}%</span>` : ''}
        <span class="file-status status-${entry.status}">${statusText}</span>
      </p>
    </div>
    <div class="file-actions">
      ${hasResult ? `<button class="row-compare" data-id="${entry.id}" aria-expanded="false">Compare</button>` : ''}
      <button class="row-download" data-id="${entry.id}" ${hasResult ? '' : 'disabled'}>Download</button>
      <button class="row-remove" data-id="${entry.id}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>
    </div>
    ${hasResult ? `
    <div class="compare-panel" id="compare-${entry.id}">
      <div class="compare-col">
        <img class="compare-before-img" src="${thumbSrc}" alt="Original">
        <p class="compare-label">Original</p>
        <p class="compare-meta">${entry.img.naturalWidth}×${entry.img.naturalHeight} · ${fmtBytes(entry.originalSize)}</p>
      </div>
      <div class="compare-col">
        <img class="compare-after-img" alt="Compressed">
        <p class="compare-label">Compressed</p>
        <p class="compare-meta">${entry.outWidth}×${entry.outHeight} · ${(entry.outFormat || '').toUpperCase()} · ${fmtBytes(entry.compressedSize)}</p>
      </div>
    </div>` : ''}
  `;
}

function updatePreviewBar() {
  const n = state.entries.length;
  previewCountEl.textContent = n === 0 ? '' : `${n} image${n > 1 ? 's' : ''} selected`;
  const maxThumbs = 6;
  const visible = state.entries.slice(0, maxThumbs);
  const thumbs = visible.map((e) => e.img
    ? `<img src="${e.img.src}" alt="">`
    : '<div class="thumb-more">…</div>'
  ).join('');
  const extra = n - maxThumbs;
  previewThumbsEl.innerHTML = thumbs + (extra > 0 ? `<div class="thumb-more">+${extra}</div>` : '');
}

function updateDropZoneVisibility() {
  const hasFiles = state.entries.length > 0;
  dropZone.classList.toggle('has-files', hasFiles);
  previewBar.classList.toggle('visible', hasFiles);
}

function updateSummary() {
  if (state.entries.length === 0) {
    summaryEl.hidden = false;
    summaryEl.textContent = 'Drop images in to get started.';
  } else {
    summaryEl.hidden = true;
  }
}

function updateProcessButtonState() {
  const ready = state.entries.filter((e) => e.img && !e.error).length;
  processAllBtn.disabled = ready === 0;
  processAllBtn.textContent = ready > 0
    ? `Compress ${ready} image${ready > 1 ? 's' : ''} →`
    : 'Compress images →';
}

// ============ Live estimate ============

let estimateTimer = null;
function scheduleEstimate() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(computeEstimate, 250);
}

async function computeEstimate() {
  if (!progressWrap.hidden) return; // don't recompute mid-batch

  const readyEntries = state.entries.filter((e) => e.img && !e.error);
  if (readyEntries.length === 0) {
    estimateBox.hidden = true;
    return;
  }

  const settings = collectSettings();
  const totalOriginal = readyEntries.reduce((s, e) => s + e.originalSize, 0);
  estimateOriginalEl.textContent = fmtBytes(totalOriginal);

  if (settings.format === 'png') {
    estimateValueEl.textContent = fmtBytes(totalOriginal);
    estimateReductionEl.textContent = 'lossless';
    estimateBox.hidden = false;
    return;
  }

  let estimatedTotal;

  if (settings.mode === 'target' && settings.targetBytes > 0) {
    estimatedTotal = readyEntries.reduce((s, e) => s + Math.min(e.originalSize, settings.targetBytes), 0);
  } else {
    // Sample a handful of real files at the chosen quality and extrapolate the ratio.
    const sample = readyEntries.slice(0, 4);
    let sampleOriginal = 0;
    let sampleCompressed = 0;
    for (const entry of sample) {
      const img = entry.img;
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (settings.maxWidth && width > settings.maxWidth) {
        const scale = settings.maxWidth / width;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const mime = settings.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const blob = await toBlobAsync(canvas, mime, settings.quality);
      sampleOriginal += entry.originalSize;
      sampleCompressed += blob.size;
    }
    const ratio = sampleOriginal > 0 ? sampleCompressed / sampleOriginal : 1;
    estimatedTotal = Math.round(totalOriginal * ratio);
  }

  const reduction = totalOriginal > 0
    ? Math.max(0, Math.round((1 - estimatedTotal / totalOriginal) * 100))
    : 0;
  estimateValueEl.textContent = '~' + fmtBytes(estimatedTotal);
  estimateReductionEl.textContent = '~' + reduction + '% smaller';
  estimateBox.hidden = false;
}

// ============ Processing ============

function collectSettings() {
  const format = formatSelect.value; // 'jpeg' | 'webp' | 'png'
  const modeInput = document.querySelector('input[name="mode"]:checked');
  const mode = modeInput ? modeInput.value : 'quality';
  const quality = parseInt(qualitySlider.value, 10) / 100;
  const targetVal = parseFloat(targetSizeInput.value) || 0;
  const targetUnit = targetUnitSelect.value; // 'KB' | 'MB'
  const targetBytes = targetUnit === 'MB' ? targetVal * 1024 * 1024 : targetVal * 1024;
  const maxWidthVal = parseInt(maxWidthInput.value, 10);
  const maxWidth = maxWidthVal > 0 ? maxWidthVal : null;
  return { format, mode, quality, targetBytes, maxWidth };
}

function toBlobAsync(canvas, mime, quality) {
  return new Promise((resolve) => {
    if (mime === 'image/png') {
      canvas.toBlob(resolve, mime);
    } else {
      canvas.toBlob(resolve, mime, quality);
    }
  });
}

async function processEntry(entry, settings) {
  const img = entry.img;
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (settings.maxWidth && width > settings.maxWidth) {
    const scale = settings.maxWidth / width;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const mime = settings.format === 'jpeg' ? 'image/jpeg' : settings.format === 'webp' ? 'image/webp' : 'image/png';

  let blob;
  if (settings.mode === 'target' && mime !== 'image/png' && settings.targetBytes > 0) {
    let low = 0.01;
    let high = 1.0;
    let best = null;
    for (let i = 0; i < 7; i++) {
      const mid = (low + high) / 2;
      const candidate = await toBlobAsync(canvas, mime, mid);
      if (candidate.size > settings.targetBytes) {
        high = mid;
      } else {
        best = candidate;
        low = mid;
      }
    }
    blob = best || (await toBlobAsync(canvas, mime, low));
  } else {
    blob = await toBlobAsync(canvas, mime, settings.quality);
  }

  if (entry.compareUrl) {
    URL.revokeObjectURL(entry.compareUrl);
    entry.compareUrl = null;
  }

  entry.compressedBlob = blob;
  entry.compressedSize = blob.size;
  entry.outFormat = settings.format;
  entry.outWidth = width;
  entry.outHeight = height;
}

async function processAll() {
  const settings = collectSettings();
  const toProcess = state.entries.filter((e) => e.img && !e.error);
  if (toProcess.length === 0) return;

  processAllBtn.disabled = true;
  setControlsLocked(true);
  resultsPanel.classList.remove('visible');
  estimateBox.hidden = true;
  progressWrap.hidden = false;
  progressFill.style.width = '0%';
  progressStatusText.textContent = `0 / ${toProcess.length} images`;
  progressFileText.textContent = '';

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];
    entry.status = 'processing';
    renderFileRow(entry);
    progressFileText.textContent = `Compressing ${entry.name}…`;

    await processEntry(entry, settings);
    entry.status = 'done';
    renderFileRow(entry);

    const pct = Math.round(((i + 1) / toProcess.length) * 100);
    progressFill.style.width = pct + '%';
    progressStatusText.textContent = `${i + 1} / ${toProcess.length} images`;
  }

  progressFileText.textContent = '';
  progressWrap.hidden = true;
  setControlsLocked(false);
  updateProcessButtonState();
  showResultsPanel();
}

function animateNumber(el, from, to, suffix, duration) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = Math.round(from + (to - from) * eased);
    el.textContent = value + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showResultsPanel() {
  const processed = state.entries.filter((e) => e.compressedSize != null);
  if (!processed.length) return;
  const totalOriginal = processed.reduce((s, e) => s + e.originalSize, 0);
  const totalCompressed = processed.reduce((s, e) => s + e.compressedSize, 0);
  const savedPct = Math.max(0, totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0);

  resultsOriginalEl.textContent = fmtBytes(totalOriginal);
  resultsFinalEl.textContent = fmtBytes(totalCompressed);
  animateNumber(resultsCountEl, 0, processed.length, '', 500);
  animateNumber(resultsPctEl, 0, savedPct, '%', 600);
  resultsPanel.classList.add('visible');
  downloadZipBtn.disabled = false;
}

function toggleCompare(id) {
  const entry = state.entries.find((en) => en.id === id);
  if (!entry || !entry.compressedBlob) return;
  const panel = document.getElementById('compare-' + id);
  const row = document.getElementById('row-' + id);
  const btn = document.querySelector(`.row-compare[data-id="${id}"]`);
  if (!panel) return;

  const nowVisible = !panel.classList.contains('visible');
  panel.classList.toggle('visible', nowVisible);
  if (row) row.classList.toggle('expanded', nowVisible);
  if (btn) btn.setAttribute('aria-expanded', String(nowVisible));

  if (nowVisible && !entry.compareUrl) {
    entry.compareUrl = URL.createObjectURL(entry.compressedBlob);
    const afterImg = panel.querySelector('.compare-after-img');
    if (afterImg) afterImg.src = entry.compareUrl;
  }
}

// ============ Event wiring ============

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
  dropZoneHeadline.textContent = DROP_ZONE_DRAGOVER_TEXT;
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
  dropZoneHeadline.innerHTML = DROP_ZONE_IDLE_HTML;
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  dropZoneHeadline.innerHTML = DROP_ZONE_IDLE_HTML;
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) addFiles(e.target.files);
  e.target.value = ''; // allow re-selecting the same file(s) again later
});

addMoreBtn.addEventListener('click', () => fileInput.click());

clearAllBtn.addEventListener('click', () => {
  state.entries.forEach((e) => { if (e.compareUrl) URL.revokeObjectURL(e.compareUrl); });
  state.entries = [];
  fileListEl.innerHTML = '';
  updateSummary();
  updateProcessButtonState();
  updateDropZoneVisibility();
  updatePreviewBar();
  resultsPanel.classList.remove('visible');
  downloadZipBtn.disabled = true;
  progressWrap.hidden = true;
  estimateBox.hidden = true;
});

fileListEl.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('row-remove')) {
    removeEntry(id);
  } else if (e.target.classList.contains('row-download')) {
    const entry = state.entries.find((en) => en.id === id);
    if (entry && entry.compressedBlob) {
      const ext = entry.outFormat === 'jpeg' ? 'jpg' : entry.outFormat;
      downloadBlob(entry.compressedBlob, baseName(entry.name) + '-quantized.' + ext);
    }
  } else if (e.target.classList.contains('row-compare')) {
    toggleCompare(id);
  }
});

qualitySlider.addEventListener('input', () => {
  qualityValueLabel.textContent = qualitySlider.value + '%';
  scheduleEstimate();
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateModeVisibility();
    scheduleEstimate();
  });
});

function updateModeVisibility() {
  const modeInput = document.querySelector('input[name="mode"]:checked');
  const mode = modeInput ? modeInput.value : 'quality';
  qualityGroup.hidden = mode !== 'quality';
  targetGroup.hidden = mode !== 'target';
  qualitySectionLabel.textContent = mode === 'target' ? 'Target size' : 'Quality';
}

formatSelect.addEventListener('change', () => {
  const isPng = formatSelect.value === 'png';
  const targetRadio = document.querySelector('input[name="mode"][value="target"]');
  pngNote.hidden = !isPng;
  targetRadio.disabled = isPng;
  if (isPng && targetRadio.checked) {
    document.querySelector('input[name="mode"][value="quality"]').checked = true;
    updateModeVisibility();
  }
  scheduleEstimate();
});

maxWidthInput.addEventListener('input', scheduleEstimate);
targetSizeInput.addEventListener('input', scheduleEstimate);
targetUnitSelect.addEventListener('change', scheduleEstimate);

processAllBtn.addEventListener('click', processAll);

downloadZipBtn.addEventListener('click', async () => {
  const processed = state.entries.filter((e) => e.compressedBlob);
  if (!processed.length) return;
  downloadZipBtn.disabled = true;
  const originalLabel = downloadZipBtn.textContent;
  downloadZipBtn.textContent = 'Zipping…';

  const zipFiles = [];
  for (let i = 0; i < processed.length; i++) {
    const entry = processed[i];
    const ext = entry.outFormat === 'jpeg' ? 'jpg' : entry.outFormat;
    const arrayBuf = await entry.compressedBlob.arrayBuffer();
    const safeName = `${i + 1}-${baseName(entry.name)}-quantized.${ext}`;
    zipFiles.push({ name: safeName, data: new Uint8Array(arrayBuf) });
  }

  const zipBlob = await buildZip(zipFiles);
  downloadBlob(zipBlob, 'quantize-export.zip');
  downloadZipBtn.disabled = false;
  downloadZipBtn.textContent = originalLabel;
});

compressAgainBtn.addEventListener('click', () => {
  resultsPanel.classList.remove('visible');
  processAll();
});

addMoreResultsBtn.addEventListener('click', () => fileInput.click());

// ============ Init ============

updateModeVisibility();
updateSummary();
updateProcessButtonState();
updateDropZoneVisibility();
updatePreviewBar();
