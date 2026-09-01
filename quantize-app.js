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
const estimateLabelEl = document.getElementById('estimateLabel');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressStatusText = document.getElementById('progressStatusText');
const resultsPanel = document.getElementById('resultsPanel');
const ctaBlock = document.getElementById('ctaBlock');
const resultsOriginalEl = document.getElementById('resultsOriginal');
const resultsFinalEl = document.getElementById('resultsFinal');
const resultsPctEl = document.getElementById('resultsPct');
const resultsMetaEl = document.getElementById('resultsMeta');
const resultsCountLineEl = document.getElementById('resultsCountLine');
const resultsPreviewEl = document.getElementById('resultsPreview');
const resultsBeforeImg = document.getElementById('resultsBeforeImg');
const resultsAfterImg = document.getElementById('resultsAfterImg');
const resultsHeroLabelEl = document.getElementById('resultsHeroLabel');
const resultsNoteEl = document.getElementById('resultsNote');
const tryLowerQualityBtn = document.getElementById('tryLowerQualityBtn');
const resultsSavedEl = document.getElementById('resultsSaved');
const resultsReadyEl = document.getElementById('resultsReady');
const resultsDownloadSummaryEl = document.getElementById('resultsDownloadSummary');
const resultsDownloadSummaryTextEl = document.getElementById('resultsDownloadSummaryText');
const copyResultInfoBtn = document.getElementById('copyResultInfoBtn');
const downloadAnywayBtn = document.getElementById('downloadAnywayBtn');
const resultsSettingsRecapEl = document.getElementById('resultsSettingsRecap');
const keepOriginalNameCheckbox = document.getElementById('keepOriginalNameCheckbox');
const fileListToggleBtn = document.getElementById('fileListToggleBtn');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const presetButtons = document.querySelectorAll('.preset-btn');

const PRESETS = {
  web:    { format: 'jpeg', mode: 'quality', quality: 75, maxWidth: 1920 },
  social: { format: 'jpeg', mode: 'quality', quality: 80, maxWidth: 1080 },
  email:  { format: 'jpeg', mode: 'quality', quality: 60, maxWidth: 1024 },
  max:    { format: 'jpeg', mode: 'quality', quality: 35, maxWidth: 1280 }
};
const compressAgainBtn = document.getElementById('compressAgainBtn');
const addMoreResultsBtn = document.getElementById('addMoreResultsBtn');
const dropZoneHeadline = document.getElementById('dropZoneHeadline');
const uploadConfirmEl = document.getElementById('uploadConfirm');
const progressFileText = document.getElementById('progressFileText');
const estimateOriginalEl = document.getElementById('estimateOriginal');
const uploadErrorEl = document.getElementById('uploadError');

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
  // If a completed result is showing, new files mean a new batch — surface the
  // compress controls again instead of leaving a stale result behind them.
  if (resultsPanel.classList.contains('visible')) {
    resultsPanel.classList.remove('visible');
    ctaBlock.hidden = false;
  }

  let skipped = 0;
  Array.from(fileList).forEach((file) => {
    if (!file.type.startsWith('image/')) { skipped++; return; }
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
  updateFileListToggle();

  if (skipped > 0) {
    uploadErrorEl.textContent = `${skipped} file${skipped > 1 ? 's were' : ' was'} skipped — not a supported image type.`;
    uploadErrorEl.hidden = false;
  } else {
    uploadErrorEl.hidden = true;
  }
}

function updateFileListToggle() {
  const total = state.entries.length;
  if (total > 8) {
    fileListToggleBtn.hidden = false;
    fileListToggleBtn.textContent = fileListEl.classList.contains('expanded')
      ? 'Show fewer'
      : `Show all ${total} files`;
  } else {
    fileListToggleBtn.hidden = true;
    fileListEl.classList.remove('expanded');
  }
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
  updateFileListToggle();
  scheduleEstimate();
  if (state.entries.length === 0) {
    resultsPanel.classList.remove('visible');
    ctaBlock.hidden = false;
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
  let savedPctTag = '';
  if (entry.compressedSize != null && entry.originalSize > 0) {
    if (entry.compressedSize < entry.originalSize) {
      const pct = Math.round((1 - entry.compressedSize / entry.originalSize) * 100);
      savedPctTag = `<span class="saved-pct">−${pct}%</span>`;
    } else {
      savedPctTag = `<span class="saved-pct no-reduction">No reduction</span>`;
    }
  }
  const hasResult = !!entry.compressedBlob;
  const statusLabels = { ready: 'Ready', processing: 'Compressing…', done: 'Done', failed: 'Failed' };
  const statusText = statusLabels[entry.status] || 'Ready';

  if (entry.status === 'failed') {
    row.innerHTML = `
      ${thumbSrc ? `<img class="thumb" src="${thumbSrc}" alt="">` : '<div class="thumb thumb-loading"></div>'}
      <div class="file-info">
        <p class="file-name">${escapeHtml(entry.name)}</p>
        <p class="file-error">Compression failed — try a different quality, format, or target size.</p>
      </div>
      <div class="file-actions">
        <button class="row-retry" data-id="${entry.id}">Retry</button>
        <button class="row-remove" data-id="${entry.id}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>
      </div>
    `;
    return;
  }

  row.innerHTML = `
    ${thumbSrc ? `<img class="thumb" src="${thumbSrc}" alt="">` : '<div class="thumb thumb-loading"></div>'}
    <div class="file-info">
      <p class="file-name">${escapeHtml(entry.name)}</p>
      <p class="file-sizes">
        <span class="size-before">${fmtBytes(entry.originalSize)}</span>
        <span class="arrow">→</span>
        <span class="size-after">${compressedText}</span>
        ${savedPctTag}
        <span class="file-status status-${entry.status}">${statusText}</span>
        ${entry.targetMissed ? '<span class="file-status status-target-missed">Target not reached</span>' : ''}
      </p>
    </div>
    <div class="file-actions">
      ${hasResult ? `<button class="row-compare" data-id="${entry.id}" aria-expanded="false">Compare</button>` : ''}
      <button class="row-download" data-id="${entry.id}" ${hasResult ? '' : 'disabled title="Compress this image first to enable download"'}>${hasResult && entry.compressedSize >= entry.originalSize ? 'Download original' : 'Download'}</button>
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

let compressionCompleted = false;

function updateProcessButtonState() {
  const ready = state.entries.filter((e) => e.img && !e.error).length;
  processAllBtn.disabled = ready === 0;
  if (compressionCompleted && ready > 0) {
    processAllBtn.textContent = 'Compress again →';
  } else {
    processAllBtn.textContent = ready > 0
      ? `Compress ${ready} image${ready > 1 ? 's' : ''} →`
      : 'Compress images →';
  }
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
  estimateLabelEl.textContent = readyEntries.length > 1
    ? `Estimate for ${readyEntries.length} images`
    : 'Estimate';

  if (settings.format === 'png') {
    estimateValueEl.textContent = 'PNG · ' + fmtBytes(totalOriginal);
    estimateReductionEl.textContent = 'Lossless — output size stays about the same';
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
      const sampleCtx = canvas.getContext('2d');
      if (settings.format === 'jpeg') {
        sampleCtx.fillStyle = '#FFFFFF';
        sampleCtx.fillRect(0, 0, width, height);
      }
      sampleCtx.drawImage(img, 0, 0, width, height);
      const mime = settings.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const blob = await toBlobAsync(canvas, mime, settings.quality);
      sampleOriginal += entry.originalSize;
      sampleCompressed += blob.size;
    }
    const ratio = sampleOriginal > 0 ? sampleCompressed / sampleOriginal : 1;
    estimatedTotal = Math.round(totalOriginal * ratio);
  }

  estimateValueEl.textContent = '~' + fmtBytes(estimatedTotal);
  if (settings.format !== 'png') {
    estimateValueEl.textContent = settings.format.toUpperCase() + ' · ~' + fmtBytes(estimatedTotal);
  }

  if (estimatedTotal >= totalOriginal) {
    estimateReductionEl.textContent = 'No size reduction expected at these settings';
  } else {
    const reduction = Math.round((1 - estimatedTotal / totalOriginal) * 100);
    estimateReductionEl.textContent = '~' + reduction + '% smaller';
  }
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
  if (settings.format === 'jpeg') {
    // JPEG has no alpha channel — flatten transparency onto white first, or
    // browsers will render transparent pixels as black.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  const mime = settings.format === 'jpeg' ? 'image/jpeg' : settings.format === 'webp' ? 'image/webp' : 'image/png';

  let blob;
  let targetMissed = false;
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
    if (blob.size > settings.targetBytes) targetMissed = true;
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
  entry.targetMissed = targetMissed;
}

// Safe export: if compression didn't actually help, default to the original file
// rather than silently handing back a larger one.
function getExportForEntry(entry) {
  const grew = entry.compressedSize != null && entry.originalSize > 0 && entry.compressedSize >= entry.originalSize;
  if (grew) {
    return { blob: entry.file, name: entry.name, usedOriginal: true };
  }
  const ext = entry.outFormat === 'jpeg' ? 'jpg' : entry.outFormat;
  const name = keepOriginalNameCheckbox.checked
    ? baseName(entry.name) + '.' + ext
    : baseName(entry.name) + '-quantized.' + ext;
  return { blob: entry.compressedBlob, name, usedOriginal: false };
}

async function processAll() {
  const settings = collectSettings();
  const toProcess = state.entries.filter((e) => e.img && !e.error);
  if (toProcess.length === 0) return;

  processAllBtn.disabled = true;
  processAllBtn.textContent = 'Compressing…';
  setControlsLocked(true);
  resultsPanel.classList.remove('visible');
  ctaBlock.hidden = true;
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

    try {
      await processEntry(entry, settings);
      entry.status = 'done';
    } catch (err) {
      entry.status = 'failed';
    }
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

function describeSettings(settings) {
  const parts = [settings.format.toUpperCase()];
  if (settings.mode === 'target') {
    parts.push(`Target ${targetSizeInput.value || '?'}${targetUnitSelect.value}`);
  } else {
    parts.push(`Quality ${qualitySlider.value}%`);
  }
  parts.push(settings.maxWidth ? `Max width ${settings.maxWidth}px` : 'No max width');
  return parts.join(' · ');
}

function showResultsPanel() {
  const processed = state.entries.filter((e) => e.compressedSize != null);
  if (!processed.length) return;
  const totalOriginal = processed.reduce((s, e) => s + e.originalSize, 0);
  const totalCompressed = processed.reduce((s, e) => s + e.compressedSize, 0);
  const isSmaller = totalCompressed < totalOriginal;
  const keptOriginalCount = processed.filter((e) => e.compressedSize >= e.originalSize).length;
  const targetMissedCount = processed.filter((e) => e.targetMissed).length;
  const savedPct = totalOriginal > 0 ? Math.max(0, Math.round((1 - totalCompressed / totalOriginal) * 100)) : 0;

  resultsOriginalEl.textContent = fmtBytes(totalOriginal);
  resultsFinalEl.textContent = fmtBytes(totalCompressed);
  compressionCompleted = true;
  updateProcessButtonState();
  resultsSettingsRecapEl.textContent = 'Current settings: ' + describeSettings(collectSettings());

  if (isSmaller) {
    animateNumber(resultsPctEl, 0, savedPct, '%', 600);
    resultsPctEl.classList.remove('no-reduction');
    resultsHeroLabelEl.textContent = 'smaller';
    resultsHeroLabelEl.hidden = false;
    resultsFinalEl.classList.remove('no-reduction-color');
    resultsSavedEl.textContent = `Saved ${fmtBytes(totalOriginal - totalCompressed)} (${savedPct}%)`;
    resultsSavedEl.hidden = false;
    resultsReadyEl.textContent = '● Ready to download';
    resultsReadyEl.hidden = false;
    tryLowerQualityBtn.hidden = true;
  } else {
    resultsPctEl.textContent = 'No savings — original is smaller';
    resultsPctEl.classList.add('no-reduction');
    resultsHeroLabelEl.hidden = true;
    resultsFinalEl.classList.add('no-reduction-color');
    resultsSavedEl.hidden = true;
    resultsReadyEl.textContent = '● Original ready to download';
    resultsReadyEl.hidden = false;
    tryLowerQualityBtn.hidden = false;
  }

  // Note line: no-reduction takes priority; otherwise flag a missed target on a single image.
  if (!isSmaller) {
    resultsNoteEl.textContent = processed.length === 1
      ? 'This image is already highly optimized — keeping the original is recommended.'
      : 'These images are already highly optimized — keeping the originals is recommended.';
    resultsNoteEl.hidden = false;
  } else if (processed.length === 1 && processed[0].targetMissed) {
    const targetLabel = targetSizeInput.value ? `${targetSizeInput.value} ${targetUnitSelect.value}` : 'the requested target';
    resultsNoteEl.textContent = `Couldn't fully reach ${targetLabel} without excessive quality loss — closest possible result shown.`;
    resultsNoteEl.hidden = false;
  } else {
    resultsNoteEl.hidden = true;
  }

  if (processed.length === 1) {
    // Single image: show output metadata + a compact before/after preview.
    const entry = processed[0];
    const dimsUnchanged = entry.outWidth === entry.img.naturalWidth && entry.outHeight === entry.img.naturalHeight;
    resultsMetaEl.textContent = `${(entry.outFormat || '').toUpperCase()} · ${entry.outWidth}×${entry.outHeight}${dimsUnchanged ? ' (unchanged)' : ''} · ${fmtBytes(entry.compressedSize)}`;
    resultsMetaEl.hidden = false;
    resultsCountLineEl.hidden = true;

    if (!entry.compareUrl) entry.compareUrl = URL.createObjectURL(entry.compressedBlob);
    resultsBeforeImg.src = entry.img.src;
    resultsAfterImg.src = entry.compareUrl;
    resultsPreviewEl.hidden = false;

    const { name: exportName } = getExportForEntry(entry);
    if (entry.compressedSize >= entry.originalSize) {
      downloadZipBtn.textContent = 'Use original →';
      downloadAnywayBtn.hidden = false;
      downloadAnywayBtn.textContent = `Download compressed version anyway (${fmtBytes(entry.compressedSize)})`;
      resultsDownloadSummaryTextEl.textContent = `${exportName} · ${fmtBytes(entry.originalSize)}`;
    } else {
      downloadZipBtn.textContent = 'Download image →';
      downloadAnywayBtn.hidden = true;
      resultsDownloadSummaryTextEl.textContent = `${exportName} · ${fmtBytes(entry.compressedSize)}`;
    }
    resultsDownloadSummaryEl.hidden = false;
  } else {
    resultsMetaEl.hidden = true;

    const outcomeText = isSmaller ? `${savedPct}% smaller` : 'no size reduction';
    let countText = `${processed.length} images • ${fmtBytes(totalOriginal)} → ${fmtBytes(totalCompressed)} • ${outcomeText}`;
    if (keptOriginalCount > 0) countText += ` (${keptOriginalCount} kept at original size)`;
    if (targetMissedCount > 0) countText += ` (${targetMissedCount} below target goal)`;
    resultsCountLineEl.textContent = countText;
    resultsCountLineEl.hidden = false;
    resultsPreviewEl.hidden = true;
    downloadAnywayBtn.hidden = true;

    resultsDownloadSummaryTextEl.textContent = `quantize-export.zip · ${processed.length} files · ${fmtBytes(totalCompressed)} total`;
    resultsDownloadSummaryEl.hidden = false;

    downloadZipBtn.textContent = `Download ZIP (${processed.length} image${processed.length > 1 ? 's' : ''}) →`;
  }

  resultsPanel.classList.add('visible');
  ctaBlock.hidden = true;
  downloadZipBtn.disabled = false;
}

async function retryEntry(id) {
  const entry = state.entries.find((en) => en.id === id);
  if (!entry || !entry.img) return;
  const settings = collectSettings();
  entry.status = 'processing';
  renderFileRow(entry);
  try {
    await processEntry(entry, settings);
    entry.status = 'done';
  } catch (err) {
    entry.status = 'failed';
  }
  renderFileRow(entry);
  if (entry.status === 'done') showResultsPanel();
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
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
  dropZoneHeadline.textContent = DROP_ZONE_DRAGOVER_TEXT;
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
  dropZoneHeadline.innerHTML = DROP_ZONE_IDLE_HTML;
});
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  dropZoneHeadline.innerHTML = DROP_ZONE_IDLE_HTML;
  const files = await getFilesFromDataTransfer(e.dataTransfer);
  if (files.length) addFiles(files);
});

// Reads dropped files, including recursing into folders where the browser supports it
// (Chrome/Edge/Firefox via webkitGetAsEntry). Falls back to the flat file list otherwise.
function getFilesFromDataTransfer(dataTransfer) {
  return new Promise((resolve) => {
    const items = dataTransfer.items;
    if (!items || !items.length || typeof items[0].webkitGetAsEntry !== 'function') {
      resolve(Array.from(dataTransfer.files));
      return;
    }

    const topEntries = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) topEntries.push(entry);
    }
    if (topEntries.length === 0) {
      resolve(Array.from(dataTransfer.files));
      return;
    }

    const files = [];
    let pending = 0;
    let dispatched = false;

    function checkDone() {
      if (dispatched && pending === 0) resolve(files);
    }

    function readDirectory(dirEntry) {
      pending++;
      const reader = dirEntry.createReader();
      function readBatch() {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            pending--;
            checkDone();
            return;
          }
          batch.forEach((child) => {
            if (child.isFile) {
              pending++;
              child.file((file) => {
                files.push(file);
                pending--;
                checkDone();
              }, () => { pending--; checkDone(); });
            } else if (child.isDirectory) {
              readDirectory(child);
            }
          });
          readBatch(); // directory readers return results in batches; keep reading until empty
        }, () => { pending--; checkDone(); });
      }
      readBatch();
    }

    topEntries.forEach((entry) => {
      if (entry.isFile) {
        pending++;
        entry.file((file) => {
          files.push(file);
          pending--;
          checkDone();
        }, () => { pending--; checkDone(); });
      } else if (entry.isDirectory) {
        readDirectory(entry);
      }
    });

    dispatched = true;
    checkDone();
  });
}

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) addFiles(e.target.files);
  e.target.value = ''; // allow re-selecting the same file(s) again later
});

addMoreBtn.addEventListener('click', () => fileInput.click());

clearAllBtn.addEventListener('click', () => {
  state.entries.forEach((e) => { if (e.compareUrl) URL.revokeObjectURL(e.compareUrl); });
  state.entries = [];
  compressionCompleted = false;
  fileListEl.innerHTML = '';
  updateSummary();
  updateProcessButtonState();
  updateDropZoneVisibility();
  updatePreviewBar();
  resultsPanel.classList.remove('visible');
  ctaBlock.hidden = false;
  downloadZipBtn.disabled = true;
  progressWrap.hidden = true;
  estimateBox.hidden = true;
  updateFileListToggle();
});

fileListToggleBtn.addEventListener('click', () => {
  fileListEl.classList.toggle('expanded');
  updateFileListToggle();
});

fileListEl.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('row-remove')) {
    removeEntry(id);
  } else if (e.target.classList.contains('row-download')) {
    const entry = state.entries.find((en) => en.id === id);
    if (entry && entry.compressedBlob) {
      const { blob, name } = getExportForEntry(entry);
      downloadBlob(blob, name);
    }
  } else if (e.target.classList.contains('row-compare')) {
    toggleCompare(id);
  } else if (e.target.classList.contains('row-retry')) {
    retryEntry(id);
  }
});

function clearPresetActive() {
  presetButtons.forEach((btn) => btn.classList.remove('active'));
}

qualitySlider.addEventListener('input', () => {
  qualityValueLabel.textContent = qualitySlider.value + '%';
  clearPresetActive();
  scheduleEstimate();
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateModeVisibility();
    clearPresetActive();
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
  clearPresetActive();
  scheduleEstimate();
});

maxWidthInput.addEventListener('input', () => {
  clearPresetActive();
  scheduleEstimate();
});
targetSizeInput.addEventListener('input', scheduleEstimate);
targetUnitSelect.addEventListener('change', scheduleEstimate);

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.dataset.preset];
    if (!preset) return;

    formatSelect.value = preset.format;
    formatSelect.dispatchEvent(new Event('change'));

    document.querySelector(`input[name="mode"][value="${preset.mode}"]`).checked = true;
    updateModeVisibility();

    qualitySlider.value = preset.quality;
    qualityValueLabel.textContent = preset.quality + '%';

    maxWidthInput.value = preset.maxWidth;

    presetButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    scheduleEstimate();
  });
});

processAllBtn.addEventListener('click', processAll);

downloadZipBtn.addEventListener('click', async () => {
  const processed = state.entries.filter((e) => e.compressedBlob);
  if (!processed.length) return;

  if (processed.length === 1) {
    const entry = processed[0];
    const { blob, name } = getExportForEntry(entry);
    downloadBlob(blob, name);
    return;
  }

  downloadZipBtn.disabled = true;
  const originalLabel = downloadZipBtn.textContent;
  downloadZipBtn.textContent = 'Zipping…';

  const zipFiles = [];
  for (let i = 0; i < processed.length; i++) {
    const entry = processed[i];
    const { blob, name } = getExportForEntry(entry);
    const arrayBuf = await blob.arrayBuffer();
    const safeName = `${i + 1}-${name}`;
    zipFiles.push({ name: safeName, data: new Uint8Array(arrayBuf) });
  }

  const zipBlob = await buildZip(zipFiles);
  downloadBlob(zipBlob, 'quantize-export.zip');
  downloadZipBtn.disabled = false;
  downloadZipBtn.textContent = originalLabel;
});

downloadAnywayBtn.addEventListener('click', () => {
  const processed = state.entries.filter((e) => e.compressedBlob);
  if (processed.length !== 1) return;
  const entry = processed[0];
  const ext = entry.outFormat === 'jpeg' ? 'jpg' : entry.outFormat;
  downloadBlob(entry.compressedBlob, baseName(entry.name) + '-quantized.' + ext);
});

copyResultInfoBtn.addEventListener('click', async () => {
  const text = resultsDownloadSummaryTextEl.textContent;
  try {
    await navigator.clipboard.writeText(text);
    copyResultInfoBtn.textContent = 'Copied';
    copyResultInfoBtn.classList.add('copied');
  } catch (err) {
    copyResultInfoBtn.textContent = 'Copy failed';
  }
  clearTimeout(copyResultInfoBtn._timer);
  copyResultInfoBtn._timer = setTimeout(() => {
    copyResultInfoBtn.textContent = 'Copy';
    copyResultInfoBtn.classList.remove('copied');
  }, 1500);
});

compressAgainBtn.addEventListener('click', () => {
  resultsPanel.classList.remove('visible');
  processAll();
});

tryLowerQualityBtn.addEventListener('click', () => {
  const qualityRadio = document.querySelector('input[name="mode"][value="quality"]');
  qualityRadio.checked = true;
  updateModeVisibility();

  const current = parseInt(qualitySlider.value, 10);
  const next = Math.max(10, current - 15);
  qualitySlider.value = next;
  qualityValueLabel.textContent = next + '%';
  scheduleEstimate();

  resultsPanel.classList.remove('visible');
  processAll();
});

addMoreResultsBtn.addEventListener('click', () => fileInput.click());

// ============ Lightbox (full-size before/after preview) ============

document.addEventListener('click', (e) => {
  if (e.target.matches('.compare-before-img, .compare-after-img, #resultsBeforeImg, #resultsAfterImg')) {
    if (e.target.src) {
      lightboxImg.src = e.target.src;
      lightbox.hidden = false;
    }
  }
});

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

// ============ Init ============

updateModeVisibility();
updateSummary();
updateProcessButtonState();
updateDropZoneVisibility();
updatePreviewBar();
updateFileListToggle();
