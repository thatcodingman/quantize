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
const fileListEl = document.getElementById('fileList');
const summaryEl = document.getElementById('summary');
const formatSelect = document.getElementById('formatSelect');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValueLabel = document.getElementById('qualityValueLabel');
const qualityGroup = document.getElementById('qualityGroup');
const targetGroup = document.getElementById('targetGroup');
const targetSizeInput = document.getElementById('targetSizeInput');
const targetUnitSelect = document.getElementById('targetUnitSelect');
const maxWidthInput = document.getElementById('maxWidthInput');
const processAllBtn = document.getElementById('processAllBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const pngNote = document.getElementById('pngNote');

// ============ Adding files ============

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    const id = 'f' + idCounter++;
    const entry = { id, file, name: file.name, originalSize: file.size, img: null, error: false, compressedBlob: null, compressedSize: null, outFormat: null };
    state.entries.push(entry);
    renderFileRow(entry);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        entry.img = img;
        renderFileRow(entry);
      };
      img.onerror = () => {
        entry.error = true;
        renderFileRow(entry);
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      entry.error = true;
      renderFileRow(entry);
    };
    reader.readAsDataURL(file);
  });
  updateProcessButtonState();
  updateSummary();
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

  const thumbSrc = entry.img ? entry.img.src : '';
  const compressedText = entry.compressedSize != null ? fmtBytes(entry.compressedSize) : '—';
  const savedPct = entry.compressedSize != null && entry.originalSize > 0
    ? Math.max(0, Math.round((1 - entry.compressedSize / entry.originalSize) * 100))
    : null;

  row.innerHTML = `
    ${thumbSrc ? `<img class="thumb" src="${thumbSrc}" alt="">` : '<div class="thumb thumb-loading"></div>'}
    <div class="file-info">
      <p class="file-name">${escapeHtml(entry.name)}</p>
      <p class="file-sizes">
        <span class="size-before">${fmtBytes(entry.originalSize)}</span>
        <span class="arrow">→</span>
        <span class="size-after">${compressedText}</span>
        ${savedPct !== null ? `<span class="saved-pct">−${savedPct}%</span>` : ''}
      </p>
    </div>
    <div class="file-actions">
      <button class="row-download" data-id="${entry.id}" ${entry.compressedBlob ? '' : 'disabled'}>Download</button>
      <button class="row-remove" data-id="${entry.id}" aria-label="Remove ${escapeHtml(entry.name)}">×</button>
    </div>
  `;
}

function updateSummary() {
  const processed = state.entries.filter((e) => e.compressedSize != null);
  if (processed.length === 0) {
    summaryEl.textContent = state.entries.length
      ? `${state.entries.length} image${state.entries.length > 1 ? 's' : ''} ready — hit "Process all" to compress.`
      : 'Drop images in to get started.';
    downloadZipBtn.disabled = true;
    return;
  }
  const totalOriginal = processed.reduce((s, e) => s + e.originalSize, 0);
  const totalCompressed = processed.reduce((s, e) => s + e.compressedSize, 0);
  const savedBytes = Math.max(0, totalOriginal - totalCompressed);
  const savedPct = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0;
  summaryEl.textContent = `${processed.length}/${state.entries.length} processed — saved ${fmtBytes(savedBytes)} total (${savedPct}%).`;
  downloadZipBtn.disabled = false;
}

function updateProcessButtonState() {
  processAllBtn.disabled = state.entries.length === 0;
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

  entry.compressedBlob = blob;
  entry.compressedSize = blob.size;
  entry.outFormat = settings.format;
}

async function processAll() {
  const settings = collectSettings();
  processAllBtn.disabled = true;
  processAllBtn.textContent = 'Processing…';

  for (const entry of state.entries) {
    if (!entry.img || entry.error) continue;
    await processEntry(entry, settings);
    renderFileRow(entry);
    updateSummary();
  }

  processAllBtn.disabled = false;
  processAllBtn.textContent = 'Process all';
  updateProcessButtonState();
}

// ============ Event wiring ============

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) addFiles(e.target.files);
  e.target.value = ''; // allow re-selecting the same file(s) again later
});

fileListEl.addEventListener('click', (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('row-remove')) {
    state.entries = state.entries.filter((en) => en.id !== id);
    const row = document.getElementById('row-' + id);
    if (row) row.remove();
    updateSummary();
    updateProcessButtonState();
  } else if (e.target.classList.contains('row-download')) {
    const entry = state.entries.find((en) => en.id === id);
    if (entry && entry.compressedBlob) {
      const ext = entry.outFormat === 'jpeg' ? 'jpg' : entry.outFormat;
      downloadBlob(entry.compressedBlob, baseName(entry.name) + '-quantized.' + ext);
    }
  }
});

qualitySlider.addEventListener('input', () => {
  qualityValueLabel.textContent = qualitySlider.value + '%';
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', updateModeVisibility);
});

function updateModeVisibility() {
  const modeInput = document.querySelector('input[name="mode"]:checked');
  const mode = modeInput ? modeInput.value : 'quality';
  qualityGroup.hidden = mode !== 'quality';
  targetGroup.hidden = mode !== 'target';
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
});

processAllBtn.addEventListener('click', processAll);

downloadZipBtn.addEventListener('click', async () => {
  const processed = state.entries.filter((e) => e.compressedBlob);
  if (!processed.length) return;
  downloadZipBtn.disabled = true;
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
  downloadZipBtn.textContent = 'Download all (.zip)';
});

// ============ Init ============

updateModeVisibility();
updateSummary();
updateProcessButtonState();
