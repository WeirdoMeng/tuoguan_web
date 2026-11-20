import { request } from './api.js';
import { escapeHtml as h } from './views.js';

const PAGE_SIZE = 10;
const PHOTO_LIMIT = 20;
const NOTE_LIMIT = 1800;
const calendarWeek = ['一', '二', '三', '四', '五', '六', '日'];
const chinaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const chinaTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function calendarDays(date) {
  const start = new Date(date.slice(0, 7) + '-01T00:00:00Z');
  start.setUTCDate(1 - (start.getUTCDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return dateKey(day);
  });
}

function shiftMonth(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  const end = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();
  return dateKey(new Date(Date.UTC(year, month - 1 + offset, Math.min(day, end))));
}

function labelDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function safePhotoUrl(url) {
  return typeof url === 'string' && (/^\/admin-api\//.test(url) || url.startsWith('blob:')) ? url : '';
}

function photoList(images, type, record = '', editable = false) {
  const photos = images || [];
  if (!photos.length && !editable) return '';
  return `<div class="homework-photos">${photos.map((photo, index) => {
    const url = safePhotoUrl(photo.url);
    return `<div class="homework-photo">
      <button type="button" class="homework-thumbnail" data-homework="preview" data-kind="${type}" data-record="${h(record)}"
        data-index="${index}" aria-label="预览照片 ${index + 1}"${url ? '' : ' disabled'}>
        ${url ? `<img src="${h(url)}" alt="" loading="lazy">` : '<span>照片暂不可用</span>'}
      </button>
      ${editable ? `<button type="button" class="homework-remove-photo" data-homework="remove-photo" data-index="${index}" aria-label="移除照片 ${index + 1}">×</button>` : ''}
    </div>`;
  }).join('')}
    ${editable ? `<button type="button" class="homework-add-photo" data-homework="add-photos"${photos.length >= PHOTO_LIMIT ? ' disabled' : ''}>
      <span class="homework-add-symbol" aria-hidden="true">+</span><span>添加照片</span>
    </button>` : ''}
  </div>`;
}

function calendarView(state) {
  const [year, month] = state.date.split('-').map(Number);
  const lock = state.saving || state.picking;
  const disabled = lock ? ' disabled' : '';
  return `<section class="homework-calendar" aria-label="作业日历">
    <div class="homework-calendar-heading">
      <h3>${year}年${month}月</h3>
      <div class="homework-calendar-controls">
        <button type="button" class="homework-calendar-today" data-homework="today"${disabled}>今天</button>
        <div class="homework-month-controls" role="group" aria-label="切换月份">
          <button type="button" data-homework="month" data-offset="-1" aria-label="上一月"${disabled}>‹</button>
          <button type="button" data-homework="month" data-offset="1" aria-label="下一月"${disabled}>›</button>
        </div>
      </div>
    </div>
    <div class="homework-days">
      ${calendarWeek.map(day => `<span class="homework-weekday" aria-hidden="true">${day}</span>`).join('')}
      ${calendarDays(state.date).map(date => {
        const mark = state.feedbackDates.has(date) ? 'feedback' : state.assignmentDates.has(date) ? 'assignment' : '';
        const selected = date === state.date;
        const title = labelDate(date) + (mark === 'feedback' ? '，老师已提交反馈' : mark === 'assignment' ? '，家长已上传作业' : '');
        return `<button type="button" class="homework-date${date.slice(0, 7) !== state.date.slice(0, 7) ? ' outside-month' : ''}"
          data-homework="date" data-date="${date}" aria-pressed="${selected}" aria-label="${title}"
          tabindex="${selected ? 0 : -1}"${date === state.today ? ' aria-current="date"' : ''}${disabled}>
          <span>${Number(date.slice(-2))}</span>${mark ? `<i class="homework-dot homework-dot--${mark}" aria-hidden="true"></i>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="homework-legend" aria-label="日历标记说明">
      <span><i class="homework-dot homework-dot--assignment" aria-hidden="true"></i>已上传作业</span>
      <span><i class="homework-dot homework-dot--feedback" aria-hidden="true"></i>已提交反馈</span>
      <span>无标记表示暂无提交</span>
    </div>
    ${state.marksError ? `<button type="button" class="text-button" data-homework="retry-marks">标记加载失败 · 重试</button>` : ''}
  </section>`;
}

function paginationView(day) {
  const pageCount = Math.ceil(day.total / day.pageSize);
  if (pageCount < 2) return '';
  return `<nav class="list-pagination list-pagination--compact" aria-label="作业分页">
    <span aria-live="polite">第 ${day.page} / ${pageCount} 页 · 共 ${day.total} 条</span>
    <span class="pagination-controls">
      <button type="button" class="button button-outline" data-homework="page" data-page="${day.page - 1}"${day.page <= 1 ? ' disabled' : ''}>上一页</button>
      <button type="button" class="button button-outline" data-homework="page" data-page="${day.page + 1}"${day.hasMore ? '' : ' disabled'}>下一页</button>
    </span>
  </nav>`;
}

function assignmentsView(day, state) {
  return `<section class="homework-section homework-section--assignments" aria-labelledby="homework-assignments-title">
    <header><h3 id="homework-assignments-title">家长上传的作业</h3>
      <time class="homework-section-context" datetime="${state.date}">${labelDate(state.date)}</time></header>
    ${day.assignments.length ? `<ol class="homework-assignments">${day.assignments.map(record =>
      `<li>${Number.isFinite(record.createdAt) ? `<div class="homework-assignment-meta">
        <time datetime="${new Date(record.createdAt).toISOString()}">${chinaTime.format(new Date(record.createdAt))}</time></div>` : ''}
        ${record.note ? `<p>${h(record.note)}</p>` : ''}
        ${photoList(record.images, 'assignment', record.id)}
      </li>`).join('')}</ol>` : '<p class="homework-empty">当天暂无上传的作业。</p>'}
    ${paginationView(day)}
  </section>`;
}

function feedbackView(day, state) {
  const draft = state.drafts.get(state.date);
  const lock = state.saving || state.picking;
  return `<section class="homework-section homework-section--feedback" aria-labelledby="homework-feedback-title">
    <header><h3 id="homework-feedback-title">完成反馈</h3>
      <span class="homework-feedback-badge" data-submitted="${Boolean(day.feedback)}">${day.feedback ? '已提交' : '未提交'}</span></header>
    ${day.editable === false ? (day.feedback ? `<p class="homework-feedback-status">${day.feedback.status === 'done' ? '已完成' : '未完成'}</p>
      ${day.feedback.note ? `<p class="homework-note">${h(day.feedback.note)}</p>` : ''}${photoList(day.feedback.images, 'saved')}` : '<p class="homework-empty">当天暂无反馈。</p>')
    + '<p class="homework-empty">该学生档案当前仅可查看历史记录。</p>' :
      `<form class="homework-feedback-form" id="homework-feedback-form">
        <fieldset class="homework-form-fields"${lock ? ' disabled' : ''}>
          <fieldset class="homework-status-options"><legend>整体完成情况</legend>
            <div class="homework-status-choices">
              ${[['pending', '未完成'], ['done', '已完成']].map(([value, label]) =>
                `<label><input type="radio" name="status" required value="${value}"${draft.status === value ? ' checked' : ''}> <span>${label}</span></label>`).join('')}
            </div>
          </fieldset>
          <label class="field homework-note-field"><span>学习情况</span>
            <textarea name="note" maxlength="${NOTE_LIMIT}" placeholder="写下当天的学习情况" rows="4">${h(draft.note)}</textarea></label>
          <div class="homework-picture-field">
            <div class="homework-picture-heading"><strong>反馈照片</strong><span>${draft.photos.length} / ${PHOTO_LIMIT}</span></div>
            ${photoList(draft.photos, 'feedback', '', true)}
            <input type="file" name="photos" accept="image/*" hidden multiple>
          </div>
        </fieldset>
      </form>`}
  </section>`;
}

function initialDraft(feedback) {
  return { status: feedback?.status || '', note: feedback?.note || '', photos: [...(feedback?.images || [])], dirty: false };
}

function releasePhotos(photos) {
  for (const photo of photos || []) if (photo.blob) URL.revokeObjectURL(photo.url);
}

async function compressPhoto(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('照片过大');
  const inputUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = inputUrl;
    await image.decode();
    const ratio = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('照片压缩失败');
    return { blob, url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(inputUrl);
  }
}

export function createHomeworkDrawer(dialog, preview, onUnauthorized) {
  let state;
  let previewSource;
  const region = () => dialog.querySelector('[data-homework-day]');

  function renderFooter(scope) {
    const footer = dialog.querySelector('.homework-footer');
    const button = footer.querySelector('.homework-save-button');
    const message = footer.querySelector('[data-homework-message]');
    footer.hidden = !button.form;
    button.disabled = Boolean(scope.saving || scope.picking || scope.dayLoading);
    button.textContent = scope.saving ? '正在保存' : scope.picking ? '正在压缩照片'
      : scope.day?.feedback ? '保存修改' : '提交反馈';
    footer.querySelector('.homework-footer-date').textContent = labelDate(scope.date);

    const feedback = scope.message;
    if (message.textContent !== (feedback?.text || '')) {
      message.hidden = !feedback;
      message.className = feedback?.error ? 'form-error' : 'homework-saved';
      message.setAttribute('role', feedback?.error ? 'alert' : 'status');
      message.textContent = feedback?.text || '';
    }
  }

  function renderCalendar(scope) {
    const host = dialog.querySelector('[data-homework-calendar]');
    dialog.querySelector('[data-homework="close"]').disabled = Boolean(scope.saving || scope.picking);
    const focus = document.activeElement;
    const current = host.contains(focus) ? focus.dataset : null;
    host.innerHTML = calendarView(scope);
    if (current) {
      const controls = Array.from(host.querySelectorAll('[data-homework]:not(:disabled)'));
      const next = current.homework === 'date'
        ? controls.find(button => button.dataset.date === scope.date)
        : controls.find(button => button.dataset.homework === current.homework && button.dataset.offset === current.offset);
      next?.focus({ preventScroll: true });
    }
  }

  function renderDay(scope) {
    const host = region();
    const active = host.contains(document.activeElement) ? document.activeElement.dataset.homework : null;
    if (scope.dayError) {
      host.innerHTML = `<div class="homework-section"><p class="form-error" role="alert">${h(scope.dayError)}</p>
        <button type="button" class="button button-outline" data-homework="retry-day">重新加载</button></div>`;
    } else if (scope.dayLoading || !scope.day) {
      host.innerHTML = '<p class="homework-empty" role="status">正在读取当天记录</p>';
    } else {
      host.innerHTML = assignmentsView(scope.day, scope) + feedbackView(scope.day, scope);
    }
    renderFooter(scope);
    if (active) host.querySelector(`[data-homework="${active}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }

  async function loadMarks(scope, force = false) {
    const month = scope.date.slice(0, 7);
    if (!force && scope.markMonth === month) return;
    scope.markMonth = month;
    scope.marksError = false;
    const serial = ++scope.markSerial;
    const days = calendarDays(scope.date);
    try {
      const marks = await request(scope.path + '/dates?' + new URLSearchParams({ start: days[0], end: days.at(-1) }));
      if (state !== scope || scope.markSerial !== serial) return;
      scope.assignmentDates = new Set(marks.dates || []);
      scope.feedbackDates = new Set(marks.feedbackDates || []);
    } catch (error) {
      if (state !== scope || scope.markSerial !== serial || onUnauthorized(error)) return;
      scope.marksError = true;
    }
    if (state === scope && scope.markSerial === serial) renderCalendar(scope);
  }

  async function loadDay(scope, page = 1, retain = false) {
    const serial = ++scope.daySerial;
    const date = scope.date;
    scope.page = page;
    scope.dayError = '';
    scope.dayLoading = true;
    if (retain) {
      region().setAttribute('aria-busy', 'true');
      for (const control of region().querySelectorAll('[data-homework="page"], [data-homework="add-photos"]')) control.disabled = true;
      renderFooter(scope);
    } else {
      renderDay(scope);
    }
    try {
      const day = await request(scope.path + '?' + new URLSearchParams({ date, page, pageSize: PAGE_SIZE }));
      if (state !== scope || scope.daySerial !== serial) return;
      scope.day = day;
      const draft = scope.drafts.get(date);
      if (!draft?.dirty) {
        releasePhotos(draft?.photos);
        scope.drafts.set(date, initialDraft(day.feedback));
      }
    } catch (error) {
      if (state !== scope || scope.daySerial !== serial || onUnauthorized(error)) return;
      scope.dayError = error.message;
    } finally {
      if (state === scope && scope.daySerial === serial) {
        scope.dayLoading = false;
        region().removeAttribute('aria-busy');
        renderDay(scope);
      }
    }
  }

  function chooseDate(scope, date) {
    if (scope.date === date || scope.saving || scope.picking) return;
    scope.date = date;
    scope.message = null;
    renderCalendar(scope);
    void loadMarks(scope);
    void loadDay(scope);
  }

  function showPreview(images, index, opener) {
    if (!safePhotoUrl(images?.[index]?.url)) return;
    previewSource = { images, index, opener };
    renderPreview();
    preview.showModal();
  }

  function renderPreview() {
    const { images, index } = previewSource;
    const url = safePhotoUrl(images[index].url);
    preview.innerHTML = `<div class="homework-preview-head"><strong>照片 ${index + 1} / ${images.length}</strong>
      <button class="editor-close" type="button" data-preview="close" aria-label="关闭照片预览">×</button></div>
      <div class="homework-preview-image">${url ? `<img src="${h(url)}" alt="照片 ${index + 1}">` : '<span>照片暂不可用</span>'}</div>
      ${images.length > 1 ? `<div class="homework-preview-controls">
        <button class="button button-outline" type="button" data-preview="previous"${index === 0 ? ' disabled' : ''}>上一张</button>
        <button class="button button-outline" type="button" data-preview="next"${index === images.length - 1 ? ' disabled' : ''}>下一张</button>
      </div>` : ''}`;
  }

  async function selectPhotos(scope, files) {
    if (!files.length || scope.picking || scope.saving || scope.dayLoading || scope.day?.editable === false) return;
    const draft = scope.drafts.get(scope.date);
    const remaining = PHOTO_LIMIT - draft.photos.length;
    scope.picking = true;
    scope.message = null;
    renderCalendar(scope);
    renderDay(scope);
    let failed = 0;
    for (const file of files.slice(0, remaining)) {
      if (state !== scope) return;
      try {
        const photo = await compressPhoto(file);
        if (state !== scope) {
          URL.revokeObjectURL(photo.url);
          return;
        }
        draft.photos.push(photo);
        draft.dirty = true;
      } catch {
        failed++;
      }
    }
    if (state !== scope) return;
    scope.picking = false;
    if (failed || files.length > remaining) {
      scope.message = { error: true, text: [
        ...(files.length > remaining ? ['每次反馈最多保留 20 张照片。'] : []),
        ...(failed ? [`${failed} 张照片无法压缩，请换用 JPG 或 PNG 后再试。`] : []),
      ].join('') };
    }
    renderCalendar(scope);
    renderDay(scope);
    region().querySelector('[data-homework="add-photos"]:not(:disabled)')?.focus();
  }

  async function save(scope) {
    if (scope.saving || scope.picking || scope.dayLoading || scope.day?.editable === false) return;
    const date = scope.date;
    const draft = scope.drafts.get(date);
    if (!['done', 'pending'].includes(draft.status)) return;
    scope.saving = true;
    scope.message = null;
    renderCalendar(scope);
    renderDay(scope);
    try {
      for (const photo of draft.photos) {
        if (photo.id) continue;
        const body = new FormData();
        body.append('file', photo.blob, 'feedback.jpg');
        const saved = await request(scope.path + '/photos?' + new URLSearchParams({ date }), { method: 'POST', body });
        if (state !== scope) return;
        photo.id = saved.id;
      }
      await request(scope.path + '/feedback', { method: 'PUT', body: {
        date, status: draft.status, note: draft.note.trim(), assetIds: draft.photos.map(photo => photo.id),
      } });
      if (state !== scope) return;
      scope.feedbackDates.add(date);
      scope.day.feedback = { status: draft.status, note: draft.note.trim(), images: draft.photos };
      draft.dirty = false;
      scope.message = { text: '反馈已保存。' };
      await Promise.all([loadDay(scope, scope.page, true), loadMarks(scope, true)]);
    } catch (error) {
      if (state !== scope || onUnauthorized(error)) return;
      scope.message = { error: true, text: error.message };
    } finally {
      if (state === scope) {
        scope.saving = false;
        renderCalendar(scope);
        renderDay(scope);
      }
    }
  }

  dialog.addEventListener('click', event => {
    const control = event.target.closest('button[data-homework]');
    const scope = state;
    if (!control || !scope) return;
    const { homework, page, index, kind, record, date, offset } = control.dataset;
    if (homework === 'close' && !scope.saving && !scope.picking) dialog.close();
    else if (homework === 'date') chooseDate(scope, date);
    else if (homework === 'today') chooseDate(scope, scope.today);
    else if (homework === 'month') chooseDate(scope, shiftMonth(scope.date, Number(offset)));
    else if (homework === 'retry-marks') void loadMarks(scope, true);
    else if (homework === 'retry-day') void loadDay(scope, scope.page);
    else if (homework === 'page' && !scope.dayLoading && !scope.saving && !scope.picking) void loadDay(scope, Number(page), true);
    else if (homework === 'add-photos') dialog.querySelector('input[type="file"]').click();
    else if (homework === 'remove-photo') {
      const draft = scope.drafts.get(scope.date);
      const [photo] = draft.photos.splice(Number(index), 1);
      releasePhotos([photo].filter(Boolean));
      draft.dirty = true;
      scope.message = null;
      renderDay(scope);
      region().querySelector('[data-homework="add-photos"]')?.focus();
    } else if (homework === 'preview') {
      const images = kind === 'assignment' ? scope.day.assignments.find(item => item.id === record)?.images
        : kind === 'saved' ? scope.day.feedback?.images : scope.drafts.get(scope.date)?.photos;
      showPreview(images, Number(index), control);
    }
  });

  dialog.addEventListener('keydown', event => {
    const focus = event.target.closest('[data-homework="date"]');
    const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!state || !focus || !direction) return;
    event.preventDefault();
    const date = new Date(focus.dataset.date + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + direction);
    chooseDate(state, dateKey(date));
  });

  dialog.addEventListener('input', event => {
    const field = event.target;
    if (!state || !['note', 'status'].includes(field.name)) return;
    const draft = state.drafts.get(state.date);
    if (!draft) return;
    draft[field.name] = field.value;
    draft.dirty = true;
  });

  dialog.addEventListener('change', event => {
    if (state && event.target.name === 'photos') void selectPhotos(state, Array.from(event.target.files));
  });

  dialog.addEventListener('submit', event => {
    if (!state || event.target.id !== 'homework-feedback-form') return;
    event.preventDefault();
    void save(state);
  });

  dialog.addEventListener('cancel', event => {
    if (state?.saving || state?.picking) event.preventDefault();
  });

  function clean(scope) {
    for (const draft of scope.drafts.values()) releasePhotos(draft.photos);
    if (preview.open) preview.close();
    dialog.innerHTML = '';
    if (scope.opener?.isConnected) scope.opener.focus();
  }

  dialog.addEventListener('close', () => {
    if (!dialog.open && state) {
      const scope = state;
      state = null;
      clean(scope);
    }
  });

  function changePreview(offset) {
    const index = previewSource.index + offset;
    if (index < 0 || index >= previewSource.images.length) return;
    previewSource.index = index;
    renderPreview();
    (preview.querySelector(`[data-preview="${offset < 0 ? 'previous' : 'next'}"]:not(:disabled)`)
      || preview.querySelector('[data-preview="close"]')).focus();
  }

  preview.addEventListener('click', event => {
    const action = event.target.closest('[data-preview]')?.dataset.preview;
    if (action === 'close') preview.close();
    if (action === 'previous') changePreview(-1);
    if (action === 'next') changePreview(1);
  });
  preview.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      changePreview(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  preview.addEventListener('close', () => {
    if (previewSource?.opener?.isConnected) previewSource.opener.focus();
    previewSource = null;
    preview.innerHTML = '';
  });

  for (const host of [dialog, preview]) {
    host.addEventListener('error', event => {
      if (!event.target.matches('img')) return;
      const fallback = document.createElement('span');
      fallback.textContent = '照片暂不可用';
      const parent = event.target.parentElement;
      event.target.replaceWith(fallback);
      if (parent.tagName === 'BUTTON') parent.disabled = true;
    }, true);
  }

  return {
    open(student, basePath, organizationName, opener) {
      if (dialog.open || state) return;
      const today = chinaDate.format(new Date());
      const scope = {
        path: basePath + '/students/' + encodeURIComponent(student.id) + '/homework',
        today, date: today, opener, drafts: new Map(), assignmentDates: new Set(), feedbackDates: new Set(),
        daySerial: 0, markSerial: 0,
      };
      state = scope;
      dialog.innerHTML = `<div class="homework-shell">
        <header class="editor-head homework-head"><div><h2 id="homework-title">作业情况 · ${h(student.name)}</h2><p>${h(organizationName)}</p></div>
          <button type="button" class="editor-close" data-homework="close" aria-label="关闭作业情况">×</button></header>
        <div class="editor-body homework-body"><div class="homework-layout">
          <div data-homework-calendar></div><div class="homework-day" data-homework-day></div>
        </div></div>
        <footer class="homework-footer" hidden>
          <div class="homework-footer-context">
            <strong class="homework-footer-date"></strong>
            <p data-homework-message hidden></p>
          </div>
          <button class="button button-primary homework-save-button" type="submit" form="homework-feedback-form">提交反馈</button>
        </footer>
      </div>`;
      dialog.showModal();
      renderCalendar(scope);
      void loadMarks(scope);
      void loadDay(scope);
    },
    close() {
      if (dialog.open) dialog.close();
      if (state) {
        const scope = state;
        state = null;
        clean(scope);
      }
    },
  };
}
