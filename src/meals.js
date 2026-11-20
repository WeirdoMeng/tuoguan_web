import './meals.css';
import { request } from './api.js';
import { escapeHtml as h } from './views.js';

const TABS = [['week', '每周菜谱'], ['daily', '每日餐食'], ['expenses', '费用管理']];
const DAYS = ['周一', '周二', '周三', '周四', '周五'];
const DISHES = [['meat', '荤菜'], ['vegetable', '素菜'], ['soup', '汤菜']];
const PAGE_SIZE = 8;
const PHOTO_LIMIT = 20;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function today() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return date.year + '-' + date.month + '-' + date.day;
}

function shiftDate(day, days) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(day) {
  const number = new Date(day + 'T00:00:00Z').getUTCDay();
  return shiftDate(day, -((number + 6) % 7));
}

function formatDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return year + '年' + month + '月' + date + '日';
}

function defaultMealTitle(day) {
  return '今日餐食 ' + day;
}

function weekTitle(start) {
  const end = shiftDate(start, 4);
  if (start.slice(0, 4) !== end.slice(0, 4)) return formatDay(start) + ' 至 ' + formatDay(end);
  const [, month, day] = end.split('-').map(Number);
  return formatDay(start) + ' 至 ' + month + '月' + day + '日';
}

function datesForWeek(start) {
  return DAYS.map((day, index) => {
    const [, month, date] = shiftDate(start, index).split('-').map(Number);
    return { day, short: month + '/' + date };
  });
}

function safeImage(scope, photo) {
  if (photo?.blob && /^blob:/.test(photo.url || '')) return photo.url;
  if (typeof photo?.url !== 'string') return '';
  const prefix = '/admin-api' + scope.path + '/photos/';
  return photo.url.startsWith(prefix) && /^[a-f\d]{32}$/i.test(photo.url.slice(prefix.length)) ? photo.url : '';
}

function listNotice(text, { retry, busy = false } = {}) {
  return `<div class="meal-notice" role="status"${busy ? ' aria-busy="true"' : ''}>
    <p>${h(text)}</p>${retry ? button('重新加载', retry, { style: 'button button-outline' }) : ''}</div>`;
}

function button(label, action, { key, style = 'button', disabled = false, icon = '' } = {}) {
  return `<button type="button" class="${style}" data-meal-action="${action}"${key === undefined ? '' : ` data-key="${h(key)}"`}${disabled ? ' disabled' : ''}>${icon}${h(label)}</button>`;
}

function releasePhoto(photo) {
  if (photo.blob) URL.revokeObjectURL(photo.url);
}

function requestKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function preparePhoto(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('单张原图请控制在 30 MB 以内。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('压缩后的照片超过 8 MB。');
    return { blob, url: URL.createObjectURL(blob) };
  } catch {
    throw new Error('无法压缩所选照片，请选择较小的 JPG、PNG 或 WebP 图片。');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function photoGrid(scope, photos, source, { editable = false, showFull = false } = {}) {
  if (!photos.length && !editable) return '';
  return `<div class="meal-photos${showFull && photos.length === 1 ? ' meal-photos-single' : ''}">
    ${photos.map((photo, index) => {
      const url = safeImage(scope, photo);
      return `<div class="meal-photo">
        <button type="button" class="meal-photo-open" aria-label="预览第 ${index + 1} 张图片" data-meal-action="photo" data-source="${source}" data-key="${index}"${url ? '' : ' disabled'}>
          ${url ? `<img src="${h(url)}" alt="" loading="lazy">` : '<span>照片暂不可用</span>'}
        </button>
        ${editable ? `<button type="button" class="meal-remove-photo" data-meal-action="remove-photo" data-key="${index}" aria-label="移除第 ${index + 1} 张照片">×</button>` : ''}
      </div>`;
    }).join('')}
    ${editable && photos.length < PHOTO_LIMIT ? `<button type="button" class="meal-add-photo" data-meal-action="add-photos"><span aria-hidden="true">+</span>添加图片</button>` : ''}
  </div>`;
}

function weeklyTable(scope) {
  const { week, menu } = scope;
  const dates = datesForWeek(week);
  return `<table class="meal-week-table">
    <caption class="sr-only">${h(weekTitle(week))}菜谱</caption>
    <thead><tr><th scope="col">菜品</th>${dates.map(({ day, short }) => `<th scope="col"><strong>${day}</strong><small>${short}</small></th>`).join('')}</tr></thead>
    <tbody>${DISHES.map(([key, label]) => `<tr>
      <th scope="row">${label}</th>
      ${dates.map(({ day, short }, index) => `<td><span class="meal-cell-day" aria-hidden="true">${day} ${short}</span><span>${h(menu.days?.[index]?.[key] || '—')}</span></td>`).join('')}
    </tr>`).join('')}</tbody>
  </table>`;
}

function dateFilter(kind, date, resetButton = '') {
  const weekly = kind === 'week';
  return `<form class="meal-date-filter" data-meal-date-filter="${kind}">
    <label class="field"><span${weekly ? ' class="sr-only"' : ''}>${weekly ? '选择日期查看所在周' : '按餐食日期筛选'}</span>
      <input type="date" name="date" value="${h(date)}" min="0001-01-01" max="9999-12-31" required>
    </label>
    <button type="submit" class="button button-outline">${weekly ? '查看该周' : '查询'}</button>
    ${resetButton}
  </form>`;
}

function weekView(scope) {
  const { week, weekDate } = scope;
  const now = startOfWeek(today());
  const [rangeStart, rangeEnd] = weekTitle(week).split(' 至 ');
  return `<section class="meal-panel meal-week-panel" aria-label="每周菜谱">
    <header class="meal-panel-head">
      <h2>每周菜谱</h2>
      ${button('发布菜谱', 'edit-week', { style: 'button button-primary', disabled: true })}
    </header>
    <div class="meal-week-nav">
      <div class="meal-week-navigation" aria-label="切换菜谱周次">
        <button type="button" class="meal-week-arrow" data-meal-action="shift-week" data-key="-7" aria-label="上一周">‹</button>
        <div class="meal-week-range">
          <small>${week === now ? '本周' : '周一至周五'}</small>
          <strong><span>${h(rangeStart)}</span> <span>至 ${h(rangeEnd)}</span></strong>
        </div>
        <button type="button" class="meal-week-arrow" data-meal-action="shift-week" data-key="7" aria-label="下一周">›</button>
      </div>
      ${dateFilter('week', weekDate, week !== now ? button('回到本周', 'now-week', { style: 'text-button meal-week-reset' }) : '')}
    </div>
    <div data-meal-week-content>${weekContent(scope)}</div>
  </section>`;
}

function weekContent(scope) {
  const { menu, weekLoading, weekError } = scope;
  if (weekLoading) return listNotice('正在读取菜谱…', { busy: true });
  if (weekError) return listNotice(weekError, { retry: 'retry-week' });
  if (!menu) return listNotice('这周还没有发布菜谱。');
  return `<div class="meal-week-body">${weeklyTable(scope)}
    ${menu.images?.length ? `<section class="meal-week-images"><h3>菜谱图片</h3>${photoGrid(scope, menu.images, 'week', { showFull: true })}</section>` : ''}</div>`;
}

function dailyView(scope) {
  const { postDate } = scope;
  return `<section class="meal-panel" aria-label="每日餐食">
    <header class="meal-panel-head"><div><h2>每日餐食</h2><p data-meal-post-count hidden></p></div>
      ${button('发布餐食', 'new-post', { style: 'button button-primary' })}</header>
    ${dateFilter('daily', postDate, postDate ? button('清除筛选', 'clear-post-date', { style: 'button button-outline' }) : '')}
    <div data-meal-post-content>${listNotice('正在读取餐食…', { busy: true })}</div>
  </section>`;
}

function dailyContent(scope) {
  const { posts, postDate, postError } = scope;
  if (postError) return listNotice(postError, { retry: 'retry-posts' });
  if (!posts?.items?.length) return listNotice(postDate ? '所选日期没有餐食记录。' : '还没有餐食记录。');
  const last = Math.max(1, Math.ceil(posts.total / PAGE_SIZE));
  return `<ul class="meal-daily-list" role="list">${posts.items.map(post => {
    const cover = safeImage(scope, post.images?.[0]);
    const count = post.photoCount || 0;
    return `<li><button type="button" class="meal-post-row" data-meal-action="post" data-key="${h(post.id)}">
      <time class="meal-post-date" datetime="${h(post.date)}">${h(formatDay(post.date))}</time>
      <span class="meal-post-body">
        ${cover ? `<span class="meal-post-cover"><img src="${h(cover)}" alt="" loading="lazy">
          ${count > 1 ? `<span class="meal-post-count">${count} 张</span>` : ''}</span>` : ''}
        <span class="meal-post-copy"><strong>${h(post.title)}</strong>
          ${post.note ? `<span class="meal-post-summary">${h(post.note)}</span>` : ''}</span>
        <span class="meal-post-more" aria-hidden="true"><span>查看餐食</span><b>›</b></span>
      </span>
    </button></li>`;
  }).join('')}</ul>
  ${last > 1 ? `<nav class="meal-pager" aria-label="每日餐食分页">
    ${button('上一页', 'page-posts', { key: posts.page - 1, style: 'button button-outline', disabled: posts.page <= 1 })}
    <span aria-live="polite">${posts.page} / ${last}</span>
    ${button('下一页', 'page-posts', { key: posts.page + 1, style: 'button button-outline', disabled: posts.page >= last })}
  </nav>` : ''}`;
}

function editorFields(operation) {
  if (operation.kind === 'week') {
    return `<div class="meal-week-fields">
      ${datesForWeek(operation.week).map(({ day, short }, index) => `<fieldset class="meal-edit-day">
        <legend>${day}<small>${short}</small></legend>
        <div class="meal-dish-fields">${DISHES.map(([key, label]) => `<label class="field"><span>${label}</span>
          <textarea name="${key}-${index}" maxlength="200" rows="2">${h(operation.days[index][key])}</textarea>
        </label>`).join('')}</div>
      </fieldset>`).join('')}
    </div>`;
  }
  return `<div class="meal-post-fields">
    <label class="field"><span>餐食标题</span><input name="title" required maxlength="60" value="${h(operation.title)}"></label>
    <label class="field"><span>餐食日期</span><input name="date" type="date" value="${h(operation.date)}" required min="0001-01-01" max="9999-12-31"></label>
    <label class="field meal-post-note-field"><span>描述 <small>选填</small></span><textarea name="note" rows="4" maxlength="2000">${h(operation.note)}</textarea></label>
  </div>`;
}

export function createMealsWorkspace({ root, handleUnauthorized, showToast, createExpenseWorkspace }) {
  root.classList.add('meals-workspace');
  root.innerHTML = `<section class="meal-workspace-head"><div><h1>餐食管理</h1><p data-meal-organization></p></div>
    <nav class="meal-tabs" role="tablist" aria-label="餐食管理菜单">${TABS.map(([key, label]) =>
      `<button type="button" id="meals-tab-${key}" data-meal-action="tab" data-key="${key}" role="tab" aria-controls="meals-panel-${key}">${label}</button>`).join('')}</nav>
    </section>
    ${TABS.map(([key]) => `<div id="meals-panel-${key}" role="tabpanel" aria-labelledby="meals-tab-${key}" hidden></div>`).join('')}
    <dialog class="meal-dialog" aria-labelledby="meal-dialog-title"></dialog>
    <dialog class="meal-preview" aria-label="餐食照片预览"></dialog>`;
  const panels = Object.fromEntries(TABS.map(([key]) => [key, root.querySelector('#meals-panel-' + key)]));
  const head = root.querySelector('[data-meal-organization]');
  const dialog = root.querySelector('.meal-dialog');
  const preview = root.querySelector('.meal-preview');
  const expenses = createExpenseWorkspace({ root: panels.expenses, handleUnauthorized, showToast });
  let scope;
  let operation;
  let picture;
  let previous;
  root.hidden = true;

  function current(expected) { return scope === expected; }

  function renderWeekContent(expected) {
    const edit = panels.week.querySelector('[data-meal-action="edit-week"]');
    edit.disabled = Boolean(expected.weekError);
    edit.textContent = expected.menu ? '编辑菜谱' : '发布菜谱';
    panels.week.querySelector('[data-meal-week-content]').innerHTML = weekContent(expected);
  }

  async function loadWeek(expected) {
    const { week } = expected;
    const revision = ++expected.weekSequence;
    const visiting = () => current(expected) && expected.weekSequence === revision;
    expected.weekLoading = true;
    expected.weekError = '';
    expected.menu = null;
    panels.week.innerHTML = weekView(expected);
    try {
      const output = await request(expected.path + '/weekly-menu?' + new URLSearchParams({ weekStart: week }));
      if (visiting()) expected.menu = output.menu;
    } catch (error) {
      if (visiting() && !handleUnauthorized(error)) expected.weekError = error.message;
    } finally {
      if (visiting()) {
        expected.weekLoading = false;
        renderWeekContent(expected);
      }
    }
  }

  async function loadPosts(expected, page = expected.postPage, focus = false) {
    const revision = ++expected.postSequence;
    const visiting = () => current(expected) && expected.postSequence === revision;
    expected.postPage = page;
    expected.postError = '';
    panels.daily.innerHTML = dailyView(expected);
    try {
      const query = new URLSearchParams({ page, pageSize: PAGE_SIZE });
      if (expected.postDate) query.set('date', expected.postDate);
      const path = expected.path + '/posts?' + query;
      const result = await request(path);
      if (!visiting()) return;
      if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total)) throw new Error('餐食列表数据格式异常。');
      const last = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > last) return loadPosts(expected, last, focus);
      expected.posts = result;
    } catch (error) {
      if (visiting() && !handleUnauthorized(error)) expected.postError = error.message;
    } finally {
      if (visiting()) {
        const count = panels.daily.querySelector('[data-meal-post-count]');
        count.hidden = !expected.posts || Boolean(expected.postError);
        if (!count.hidden) {
          const day = expected.postDate ? formatDay(expected.postDate) + ' · ' : '';
          count.textContent = day + expected.posts.total + ' 条餐食记录';
        }
        panels.daily.querySelector('[data-meal-post-content]').innerHTML = dailyContent(expected);
        if (focus && expected.tab === 'daily' && document.activeElement === document.body) (panels.daily.querySelector('.meal-post-row')
          || panels.daily.querySelector('[data-meal-action="new-post"]'))?.focus({ preventScroll: true });
      }
    }
  }

  function selectTab(tab, focus = false) {
    const expected = scope;
    if (!expected || !Object.hasOwn(panels, tab)) return;
    if (expected.tab === 'expenses' && tab !== 'expenses') expenses.hide();
    expected.tab = tab;
    previous = { id: expected.id, tab };
    for (const [key] of TABS) {
      const control = root.querySelector('#meals-tab-' + key);
      control.setAttribute('aria-selected', String(key === tab));
      control.tabIndex = key === tab ? 0 : -1;
      panels[key].hidden = key !== tab;
      if (focus && key === tab) control.focus();
    }
    if (tab === 'week' && !expected.weekSequence) return loadWeek(expected);
    if (tab === 'daily' && !expected.postSequence) return loadPosts(expected);
    if (tab === 'expenses') return expenses.show({ organizationId: expected.id, organizationName: expected.organizationName });
  }

  function openDialog(action, content, anchor) {
    operation = { ...action, anchor };
    dialog.innerHTML = content;
    dialog.showModal();
    const field = dialog.querySelector('[autofocus]') || dialog.querySelector('input:not([type="file"]), textarea');
    (field || dialog.querySelector('button'))?.focus({ preventScroll: true });
    return operation;
  }

  function closeDialog(force = false) {
    if (!operation || (!force && (operation.saving || operation.picking))) return;
    if (preview.open) closePicture(false);
    operation.photos?.forEach(releasePhoto);
    const opener = operation.anchor;
    operation = null;
    dialog.close();
    dialog.textContent = '';
    if (!force && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function frame(title, subtitle, body, actions = '') {
    return `<div class="meal-dialog-inner">
      <header class="meal-dialog-head"><div><h2 id="meal-dialog-title">${h(title)}</h2>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div>
      <button type="button" class="editor-close meal-close" aria-label="关闭弹窗" data-meal-action="close">×</button></header>
      <div class="meal-dialog-body">${body}</div>
      ${actions ? `<footer class="meal-dialog-actions"><p data-meal-form-error role="alert" hidden></p><div>${actions}</div></footer>` : ''}
    </div>`;
  }

  function drawEditor(entry) {
    const week = entry.kind === 'week';
    const title = week ? (entry.revision ? '编辑周菜谱' : '发布周菜谱') : (entry.post ? '编辑每日餐食' : '发布每日餐食');
    const content = `<form id="meal-edit-form">
      <fieldset class="meal-edit-fields">${editorFields(entry)}
        <section class="meal-editor-photos" aria-label="上传图片">
          <div class="meal-upload-head"><strong>${week ? '菜谱图片' : '餐食图片'} <small>选填</small></strong><span data-meal-photo-count></span></div>
          <div data-meal-draft-photos></div><input type="file" name="attachments" accept="image/*" multiple hidden>
        </section>
      </fieldset>
    </form>`;
    const actions = `${button('取消', 'close', { style: 'button button-outline' })}
      <button type="submit" form="meal-edit-form" class="button button-primary" data-meal-save>${entry.revision || entry.post ? '保存并发布' : '确认发布'}</button>`;
    return frame(title, week ? weekTitle(entry.week) : '', content, actions);
  }

  function editWeek(anchor) {
    const { week, menu, weekLoading, weekError } = scope;
    if (weekLoading || weekError) return;
    const entry = {
      kind: 'week', week, revision: menu?.revision || 0,
      days: DAYS.map((_, i) => Object.fromEntries(DISHES.map(([key]) => [key, menu?.days?.[i]?.[key] || '']))),
      photos: [...(menu?.images || [])],
    };
    openDialog(entry, drawEditor(entry), anchor);
    renderDraftPhotos();
  }

  function editPost(post, anchor) {
    const date = post?.date || today();
    const entry = {
      kind: 'edit-post', post, revision: post?.revision || 0, requestId: requestKey(),
      title: post ? post.title : defaultMealTitle(date), date, note: post?.note || '', photos: [...(post?.images || [])],
    };
    if (operation) {
      operation = { ...entry, anchor: operation.anchor };
      dialog.innerHTML = drawEditor(operation);
      dialog.querySelector('input[name="title"]').focus();
    } else openDialog(entry, drawEditor(entry), anchor);
    renderDraftPhotos();
  }

  function renderDraftPhotos() {
    dialog.querySelector('[data-meal-photo-count]').textContent = operation.photos.length + ' / ' + PHOTO_LIMIT;
    dialog.querySelector('[data-meal-draft-photos]').innerHTML = photoGrid(scope, operation.photos, 'draft', { editable: true });
  }

  function formStatus(entry, message = '') {
    const area = dialog.querySelector('[data-meal-form-error]');
    if (area) {
      area.textContent = message;
      area.hidden = !message;
    }
    const busy = Boolean(entry.saving || entry.picking);
    const save = dialog.querySelector('[data-meal-save]');
    if (save) {
      save.disabled = busy;
      save.textContent = entry.picking ? '正在处理图片…' : entry.saving ? '正在发布…'
        : entry.revision || entry.post ? '保存并发布' : '确认发布';
    }
    const fields = dialog.querySelector('.meal-edit-fields');
    if (fields) fields.disabled = busy;
    dialog.querySelectorAll('[data-meal-action="close"]').forEach(item => { item.disabled = busy; });
  }

  async function choosePhotos(files) {
    const entry = operation;
    const expected = scope;
    if (!entry?.photos || entry.saving || entry.picking) return;
    const remaining = PHOTO_LIMIT - entry.photos.length;
    if (!remaining) return;
    entry.picking = true;
    formStatus(entry);
    const cutoff = files.length > remaining;
    let failed = 0;
    try {
      for (const file of files.slice(0, remaining)) {
        if (operation !== entry || !current(expected)) return;
        try {
          const photo = await preparePhoto(file);
          if (operation !== entry || !current(expected)) {
            releasePhoto(photo);
            return;
          }
          entry.photos.push(photo);
        } catch { failed++; }
      }
    } finally {
      if (operation === entry && current(expected)) {
        entry.picking = false;
        renderDraftPhotos();
        formStatus(entry, [cutoff ? '每条最多可添加 20 张照片。' : '', failed ? `${failed} 张照片无法读取，请更换格式或较小的图片。` : ''].join(' '));
        (dialog.querySelector('[data-meal-action="add-photos"]') || dialog.querySelector('[data-meal-save]'))?.focus({ preventScroll: true });
      }
    }
  }

  async function viewPost(id, anchor) {
    const expected = scope;
    if (!/^[a-f\d]{32}$/i.test(id)) return;
    const entry = openDialog({ kind: 'post', id }, frame('餐食详情', '', listNotice('正在读取餐食…', { busy: true })), anchor);
    try {
      const { post } = await request(expected.path + '/posts/' + encodeURIComponent(id));
      if (!current(expected) || operation !== entry) return;
      entry.post = post;
      dialog.innerHTML = frame(post.title, formatDay(post.date), `<article class="meal-post-detail">
        ${post.note ? `<p>${h(post.note)}</p>` : ''}${photoGrid(expected, post.images || [], 'detail')}
        ${!post.note && !post.images?.length ? '<p class="meal-muted">这条餐食记录暂无描述或图片。</p>' : ''}
      </article>`, `${button('删除', 'confirm-delete', { style: 'button meal-danger-outline' })}
        ${button('编辑', 'edit-post', { style: 'button button-primary' })}`);
      dialog.querySelector('[data-meal-action="close"]').focus();
    } catch (error) {
      if (current(expected) && operation === entry && !handleUnauthorized(error)) {
        dialog.innerHTML = frame('餐食详情', '', listNotice(error.message, { retry: 'retry-post' }));
        dialog.querySelector('[data-meal-action="retry-post"]').focus();
      }
    }
  }

  function showPicture(source, index, anchor) {
    const photos = source === 'week' ? scope.menu?.images : source === 'draft' ? operation?.photos : operation?.post?.images;
    if (!safeImage(scope, photos?.[index])) return;
    picture = { photos, index, anchor };
    renderPicture();
    preview.showModal();
    preview.querySelector('[data-meal-action="close-picture"]').focus();
  }

  function renderPicture() {
    const { photos, index } = picture;
    const url = safeImage(scope, photos[index]);
    preview.innerHTML = `<header><strong>照片 ${index + 1} / ${photos.length}</strong>
      <button type="button" class="editor-close meal-close" data-meal-action="close-picture" aria-label="关闭照片预览">×</button></header>
      <div>${url ? `<img src="${h(url)}" alt="餐食照片 ${index + 1}">` : '<span>照片暂不可用</span>'}</div>
      ${photos.length > 1 ? `<footer>
        ${button('上一张', 'slide-picture', { key: -1, style: 'button button-outline', disabled: index <= 0 })}
        ${button('下一张', 'slide-picture', { key: 1, style: 'button button-outline', disabled: index >= photos.length - 1 })}
      </footer>` : ''}`;
  }

  function closePicture(focus = true) {
    const anchor = picture?.anchor;
    picture = null;
    preview.close();
    preview.textContent = '';
    if (focus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }

  function confirmDelete() {
    const entry = operation;
    if (!entry?.post) return;
    entry.confirmDelete = true;
    dialog.innerHTML = frame('删除餐食记录', formatDay(entry.post.date),
      `<p class="meal-delete-message">确定删除「${h(entry.post.title)}」？删除后，这条记录会从网页和小程序的餐食列表移除。</p>`,
      `${button('取消', 'back-post', { style: 'button button-outline' })}
        ${button('确认删除', 'delete-post', { style: 'button meal-danger' })}`);
    dialog.querySelector('[data-meal-action="back-post"]').focus();
  }

  async function deletePost() {
    const entry = operation;
    const expected = scope;
    if (!entry?.post || !entry.confirmDelete || entry.saving) return;
    entry.saving = true;
    dialog.querySelectorAll('button').forEach(item => { item.disabled = true; });
    try {
      await request(expected.path + '/posts/' + encodeURIComponent(entry.post.id), { method: 'DELETE' });
      if (!current(expected) || operation !== entry) return;
      closeDialog(true);
      showToast('餐食记录已删除。');
      await loadPosts(expected, expected.postPage, true);
    } catch (error) {
      if (current(expected) && operation === entry && !handleUnauthorized(error)) {
        entry.saving = false;
        formStatus(entry, error.message);
        dialog.querySelectorAll('button').forEach(item => { item.disabled = false; });
      }
    }
  }

  async function save(form) {
    const entry = operation;
    const expected = scope;
    if (!entry?.photos || entry.picking || entry.saving) return;
    const fields = new FormData(form);
    const value = name => String(fields.get(name) ?? '').trim();
    const weekly = entry.kind === 'week';
    const payload = weekly ? {
      weekStart: entry.week, revision: entry.revision,
      days: DAYS.map((_, i) => Object.fromEntries(DISHES.map(([key]) => [key, value(key + '-' + i)]))),
    } : { title: value('title'), date: value('date'), note: value('note') };
    if (weekly && !entry.photos.length && !payload.days.some(day => Object.values(day).some(Boolean))) {
      formStatus(entry, '填写一道菜或添加一张菜谱图片后即可发布。');
      return;
    }
    if (!weekly && !payload.title) {
      formStatus(entry, '请填写餐食标题。');
      return;
    }
    entry.saving = true;
    formStatus(entry);
    const staying = () => current(expected) && operation === entry;
    try {
      for (const photo of entry.photos) {
        if (!staying()) return;
        if (photo.id) continue;
        const body = new FormData();
        body.append('file', photo.blob, 'meal.jpg');
        const result = await request(expected.path + '/photos', { method: 'POST', body });
        if (!staying()) return;
        if (!/^[a-f\d]{32}$/i.test(result.id || '')) throw new Error('图片上传未完成，请重试。');
        photo.id = result.id;
      }
      payload.assetIds = entry.photos.map(photo => photo.id);
      const endpoint = weekly ? '/weekly-menu' : entry.post ? '/posts/' + encodeURIComponent(entry.post.id) : '/posts';
      if (!weekly) {
        if (entry.post) {
          const signature = JSON.stringify(payload);
          if (entry.signature !== signature) {
            entry.signature = signature;
            entry.requestId = requestKey();
          }
          payload.revision = entry.revision;
        }
        payload.requestId = entry.requestId;
      }
      const result = await request(expected.path + endpoint, {
        method: weekly ? 'PUT' : entry.post ? 'PATCH' : 'POST', body: payload,
      });
      if (!staying()) return;
      closeDialog(true);
      if (weekly) {
        showToast('周菜谱已发布。');
        expected.menu = result.menu;
        renderWeekContent(expected);
        panels.week.querySelector('[data-meal-action="edit-week"]')?.focus({ preventScroll: true });
      } else {
        showToast(expected.postDate && expected.postDate !== payload.date
          ? `餐食记录已发布到${formatDay(payload.date)}，当前筛选保持不变。`
          : '餐食记录已发布。');
        await loadPosts(expected, 1, true);
      }
    } catch (error) {
      if (staying() && !handleUnauthorized(error)) {
        entry.saving = false;
        formStatus(entry, error.message);
      }
    }
  }

  root.addEventListener('click', async event => {
    const control = event.target.closest('button[data-meal-action]');
    if (!control || !root.contains(control) || !scope) return;
    const { mealAction: action, key, source } = control.dataset;
    if (action === 'tab') await selectTab(key);
    else if (action === 'shift-week' || action === 'now-week' || action === 'retry-week') {
      if (action === 'shift-week') {
        scope.week = shiftDate(scope.week, Number(key));
        scope.weekDate = scope.week;
      }
      if (action === 'now-week') {
        scope.weekDate = today();
        scope.week = startOfWeek(scope.weekDate);
      }
      const expected = scope;
      await loadWeek(expected);
      if (current(expected)) {
        const target = [...panels.week.querySelectorAll('[data-meal-action="shift-week"]')].find(item =>
          item.dataset.key === (key || '-7'));
        target?.focus({ preventScroll: true });
      }
    } else if (action === 'clear-post-date') {
      scope.postDate = '';
      await loadPosts(scope, 1, true);
    } else if (action === 'page-posts' || action === 'retry-posts') await loadPosts(scope, Number(key) || scope.postPage, true);
    else if (action === 'edit-week') editWeek(control);
    else if (action === 'new-post') editPost(null, control);
    else if (action === 'edit-post' && operation?.post) editPost(operation.post);
    else if (action === 'post') await viewPost(key, control);
    else if (action === 'retry-post' || action === 'back-post') {
      if (!operation?.id) return;
      const { id, anchor } = operation;
      closeDialog(true);
      await viewPost(id, anchor);
    } else if (action === 'confirm-delete') confirmDelete();
    else if (action === 'delete-post') await deletePost();
    else if (action === 'close') closeDialog();
    else if (action === 'add-photos') dialog.querySelector('input[type="file"]')?.click();
    else if (action === 'remove-photo' && operation?.photos && !operation.saving && !operation.picking) {
      const [photo] = operation.photos.splice(Number(key), 1);
      if (!photo) return;
      releasePhoto(photo);
      renderDraftPhotos();
      dialog.querySelector('[data-meal-action="add-photos"]')?.focus({ preventScroll: true });
    } else if (action === 'photo') showPicture(source, Number(key), control);
    else if (action === 'close-picture') closePicture();
    else if (action === 'slide-picture' && picture) {
      const index = picture.index + Number(key);
      if (!picture.photos[index]) return;
      picture.index = index;
      renderPicture();
      (preview.querySelector(`[data-key="${key}"]:not(:disabled)`) || preview.querySelector('[data-meal-action="close-picture"]')).focus();
    }
  });

  root.addEventListener('submit', async event => {
    const form = event.target;
    const kind = form.dataset.mealDateFilter;
    const expected = scope;
    if (!kind || !expected || expected.tab !== kind) return;
    event.preventDefault();
    const date = form.elements.date.value;
    if (!date || !form.elements.date.validity.valid) return;
    if (kind === 'week') {
      expected.weekDate = date;
      const week = startOfWeek(date);
      if (week === expected.week && !expected.weekError) return;
      expected.week = week;
      await loadWeek(expected);
      if (current(expected) && expected.tab === 'week' && document.activeElement === document.body) {
        panels.week.querySelector('[data-meal-date-filter] input')?.focus({ preventScroll: true });
      }
    } else {
      if (date === expected.postDate && expected.postPage === 1 && !expected.postError) return;
      expected.postDate = date;
      await loadPosts(expected, 1, true);
    }
  });

  dialog.addEventListener('submit', event => {
    if (event.target.id === 'meal-edit-form') {
      event.preventDefault();
      void save(event.target);
    }
  });
  dialog.addEventListener('change', event => {
    const field = event.target;
    if (field.type === 'file') {
      const files = [...field.files];
      field.value = '';
      if (files.length) void choosePhotos(files);
    } else if (field.name === 'date' && field.validity.valid && operation?.kind === 'edit-post' && !operation.post) {
      const title = dialog.querySelector('input[name="title"]');
      const previous = operation.title;
      operation.title = defaultMealTitle(field.value);
      if (title.value === previous) title.value = operation.title;
    }
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  preview.addEventListener('cancel', event => {
    event.preventDefault();
    closePicture();
  });
  root.querySelector('.meal-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !scope) return;
    event.preventDefault();
    const index = TABS.findIndex(([key]) => key === scope.tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
      : (index + (event.key === 'ArrowLeft' ? -1 : 1) + TABS.length) % TABS.length;
    void selectTab(TABS[next][0], true);
  });

  function hide() {
    closeDialog(true);
    if (preview.open) closePicture(false);
    expenses.hide();
    root.hidden = true;
    scope = null;
    panels.week.textContent = '';
    panels.daily.textContent = '';
  }

  return {
    show({ organizationId, organizationName }) {
      if (!organizationId) return hide();
      if (scope?.id === organizationId && !root.hidden) return;
      hide();
      const date = today();
      scope = {
        id: organizationId, organizationName: organizationName || organizationId,
        path: '/organizations/' + encodeURIComponent(organizationId) + '/meals',
        week: startOfWeek(date), weekDate: date, weekSequence: 0, postSequence: 0, postPage: 1, postDate: '',
      };
      root.hidden = false;
      head.textContent = scope.organizationName;
      return selectTab(previous?.id === organizationId ? previous.tab : 'week');
    },
    hide,
  };
}
