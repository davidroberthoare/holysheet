import * as pdfjsLib from '../../vendor/pdfjs/pdf.min.mjs';
import { getSheet } from '../storage/sheets.js';
import { getPlaylist } from '../storage/playlists.js';
import { getPageAnnotation, saveStrokes, clearPageAnnotation } from '../storage/annotations.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const DPR = window.devicePixelRatio || 1;
const PEN_COLOR = '#e63946';
const PEN_WIDTH_CSS = 3;
const SWIPE_THRESHOLD = 60;

function pageShellHtml() {
  return `
    <div class="page viewer-page" data-name="viewer">
      <div class="navbar">
        <div class="navbar-bg"></div>
        <div class="navbar-inner">
          <div class="left"><a href="#" class="link back"><i class="icon icon-back"></i></a></div>
          <div class="title" id="viewer-title">Loading…</div>
          <div class="right">
            <a href="#" class="link" id="pen-toggle"><i class="icon f7-icons">pencil</i></a>
          </div>
        </div>
      </div>
      <div class="page-content viewer-content" id="viewer-pages"></div>
      <div class="toolbar toolbar-bottom viewer-toolbar" id="viewer-toolbar">
        <div class="toolbar-inner">
          <a href="#" class="link song-nav" id="prev-song-btn"><i class="icon f7-icons">chevron_left</i></a>
          <a href="#" class="link" id="undo-btn"><i class="icon f7-icons">arrow_uturn_left</i></a>
          <a href="#" class="link" id="clear-btn"><i class="icon f7-icons">trash</i></a>
          <a href="#" class="link song-nav" id="next-song-btn"><i class="icon f7-icons">chevron_right</i></a>
        </div>
      </div>
    </div>
  `;
}

function makePageEl(devW, devH, cssW, cssH) {
  const wrapper = document.createElement('div');
  wrapper.className = 'viewer-page-wrap';
  wrapper.style.width = `${cssW}px`;
  wrapper.style.height = `${cssH}px`;

  const canvas = document.createElement('canvas');
  canvas.width = devW;
  canvas.height = devH;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.className = 'viewer-base-canvas';

  const annoCanvas = document.createElement('canvas');
  annoCanvas.width = devW;
  annoCanvas.height = devH;
  annoCanvas.style.width = `${cssW}px`;
  annoCanvas.style.height = `${cssH}px`;
  annoCanvas.className = 'viewer-anno-canvas';

  wrapper.appendChild(canvas);
  wrapper.appendChild(annoCanvas);
  return { wrapper, canvas, annoCanvas };
}

async function renderSong(container, sheet, onPageReady) {
  container.innerHTML = '';
  const cssWidth = container.clientWidth;

  if (sheet.fileType === 'pdf') {
    const buf = await sheet.blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth / unscaled.width) * DPR });
      const { wrapper, canvas, annoCanvas } = makePageEl(viewport.width, viewport.height, cssWidth, viewport.height / DPR);
      container.appendChild(wrapper);
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      // eslint-disable-next-line no-await-in-loop
      await onPageReady({ pageNum: n, wrapper, annoCanvas });
    }
  } else {
    const bitmap = await createImageBitmap(sheet.blob);
    const scale = cssWidth / bitmap.width;
    const cssHeight = bitmap.height * scale;
    const { wrapper, canvas, annoCanvas } = makePageEl(cssWidth * DPR, cssHeight * DPR, cssWidth, cssHeight);
    container.appendChild(wrapper);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    await onPageReady({ pageNum: 1, wrapper, annoCanvas });
  }
}

function drawStroke(ctx, stroke) {
  if (stroke.points.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
  }
  ctx.stroke();
}

function redrawAnnotations(pageInfo) {
  const ctx = pageInfo.annoCanvas.getContext('2d');
  ctx.clearRect(0, 0, pageInfo.annoCanvas.width, pageInfo.annoCanvas.height);
  pageInfo.strokes.forEach((stroke) => drawStroke(ctx, stroke));
}

function setPageDrawMode(pageInfo, drawMode) {
  pageInfo.annoCanvas.style.pointerEvents = drawMode ? 'auto' : 'none';
  pageInfo.annoCanvas.style.touchAction = drawMode ? 'none' : 'auto';
}

function wireDrawing(pageInfo, state, sheetId) {
  const canvas = pageInfo.annoCanvas;
  let currentStroke = null;

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.drawMode) return;
    canvas.setPointerCapture(e.pointerId);
    currentStroke = { points: [point(e)], color: PEN_COLOR, width: PEN_WIDTH_CSS * DPR };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.drawMode || !currentStroke) return;
    currentStroke.points.push(point(e));
    redrawAnnotations(pageInfo);
    drawStroke(canvas.getContext('2d'), currentStroke);
  });

  canvas.addEventListener('pointerup', async () => {
    if (!currentStroke) return;
    pageInfo.strokes.push(currentStroke);
    currentStroke = null;
    redrawAnnotations(pageInfo);
    await saveStrokes(sheetId, pageInfo.pageNum, pageInfo.strokes);
  });

  canvas.addEventListener('pointercancel', () => {
    currentStroke = null;
  });
}

// Picks the topmost page currently scrolled into view, so undo/clear act on
// whatever the player is actually looking at during continuous scroll.
function currentVisiblePage(container, state) {
  if (!state.currentPages.length) return null;
  if (state.currentPages.length === 1) return state.currentPages[0];
  const containerTop = container.getBoundingClientRect().top;
  let best = state.currentPages[0];
  for (const p of state.currentPages) {
    if (p.wrapper.getBoundingClientRect().top <= containerTop + 10) {
      best = p;
    } else {
      break;
    }
  }
  return best;
}

async function initViewer(page, songIds, startIndex) {
  const { app } = page;
  const state = {
    songIds,
    index: Math.min(Math.max(startIndex, 0), songIds.length - 1),
    drawMode: false,
    currentPages: [],
    sheet: null,
    cancelled: false,
  };
  page.viewerState = state;
  document.body.classList.add('viewer-mode');

  const container = page.el.querySelector('#viewer-pages');
  const titleEl = page.el.querySelector('#viewer-title');
  const penBtn = page.el.querySelector('#pen-toggle');
  const undoBtn = page.el.querySelector('#undo-btn');
  const clearBtn = page.el.querySelector('#clear-btn');
  const prevBtn = page.el.querySelector('#prev-song-btn');
  const nextBtn = page.el.querySelector('#next-song-btn');

  if (songIds.length <= 1) {
    page.el.querySelector('#viewer-toolbar').classList.add('single-mode');
  }

  function applyDrawMode() {
    penBtn.classList.toggle('viewer-active-btn', state.drawMode);
    container.style.overflowY = state.drawMode ? 'hidden' : 'auto';
    state.currentPages.forEach((p) => setPageDrawMode(p, state.drawMode));
  }

  async function loadSong(index) {
    state.index = index;
    const sheetId = state.songIds[index];
    const sheet = await getSheet(sheetId);
    if (state.cancelled) return;

    if (!sheet) {
      titleEl.textContent = 'Sheet not found';
      container.innerHTML = '';
      state.currentPages = [];
      return;
    }

    state.sheet = sheet;
    state.currentPages = [];
    titleEl.textContent = songIds.length > 1 ? `${index + 1}/${songIds.length} · ${sheet.title}` : sheet.title;

    await renderSong(container, sheet, async ({ pageNum, wrapper, annoCanvas }) => {
      if (state.cancelled) return;
      const record = await getPageAnnotation(sheetId, pageNum);
      const pageInfo = { pageNum, wrapper, annoCanvas, strokes: record ? record.strokes : [] };
      state.currentPages.push(pageInfo);
      redrawAnnotations(pageInfo);
      wireDrawing(pageInfo, state, sheetId);
      setPageDrawMode(pageInfo, state.drawMode);
    });
  }

  function goTo(index) {
    if (index < 0 || index >= state.songIds.length) return;
    loadSong(index);
  }

  penBtn.addEventListener('click', (e) => {
    e.preventDefault();
    state.drawMode = !state.drawMode;
    applyDrawMode();
  });

  undoBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const p = currentVisiblePage(container, state);
    if (!p || !p.strokes.length) return;
    p.strokes.pop();
    redrawAnnotations(p);
    await saveStrokes(state.sheet.id, p.pageNum, p.strokes);
  });

  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const p = currentVisiblePage(container, state);
    if (!p) return;
    app.dialog.confirm('Clear annotations on this page?', 'Clear', async () => {
      p.strokes = [];
      redrawAnnotations(p);
      await clearPageAnnotation(state.sheet.id, p.pageNum);
    });
  });

  prevBtn.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(state.index - 1);
  });
  nextBtn.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(state.index + 1);
  });

  function onKeydown(e) {
    if (state.drawMode) return;
    if (e.key === 'ArrowLeft') goTo(state.index - 1);
    if (e.key === 'ArrowRight') goTo(state.index + 1);
  }
  document.addEventListener('keydown', onKeydown);
  page.viewerKeydownHandler = onKeydown;

  let touchStartX = null;
  let touchStartY = null;
  function onTouchStart(e) {
    if (state.drawMode) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }
  function onTouchEnd(e) {
    if (state.drawMode || touchStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(state.index + (dx < 0 ? 1 : -1));
    }
  }
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  page.viewerTouchHandlers = { container, onTouchStart, onTouchEnd };

  await loadSong(state.index);
}

function cleanupViewer(event, page) {
  document.body.classList.remove('viewer-mode');
  if (page.viewerState) page.viewerState.cancelled = true;
  if (page.viewerKeydownHandler) document.removeEventListener('keydown', page.viewerKeydownHandler);
  if (page.viewerTouchHandlers) {
    const { container, onTouchStart, onTouchEnd } = page.viewerTouchHandlers;
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchend', onTouchEnd);
  }
}

export const viewerRoute = {
  path: '/viewer/:sheetId/',
  name: 'viewer',
  content: pageShellHtml(),
  on: {
    pageInit(event, page) {
      initViewer(page, [page.route.params.sheetId], 0);
    },
    pageBeforeOut: cleanupViewer,
  },
};

export const viewerPlaylistRoute = {
  path: '/viewer/playlist/:playlistId/',
  name: 'viewer-playlist',
  content: pageShellHtml(),
  on: {
    async pageInit(event, page) {
      const { app } = page;
      const playlist = await getPlaylist(page.route.params.playlistId);
      if (!playlist || !playlist.sheetIds.length) {
        app.views.main.router.navigate('/playlists/', { reloadCurrent: true });
        return;
      }
      const startId = page.route.query.start;
      const startIndex = startId ? Math.max(playlist.sheetIds.indexOf(startId), 0) : 0;
      initViewer(page, playlist.sheetIds, startIndex);
    },
    pageBeforeOut: cleanupViewer,
  },
};
