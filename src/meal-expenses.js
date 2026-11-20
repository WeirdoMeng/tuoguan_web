import './meal-expenses.css';
import { request } from './api.js';
import { downloadFinanceWorkbook } from './finance-overview-export.js';
import { decimal, money } from './finance-views.js';
import { prepareProofImage } from './proof-image.js';
import { escapeHtml as h } from './views.js';

const categories = { ingredients: '食材采购', catering: '外购餐食', supplies: '餐具耗材', other: '其他支出' };
const pageSize = 15;
const proofLimit = 5;
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });

function button(label, action, style = 'button button-outline', id) {
  return `<button type="button" class="${style}" data-expense-action="${action}"${id == null ? '' : ` data-id="${h(id)}"`}>${h(label)}</button>`;
}

function categoryOptions(selected, empty) {
  const options = empty ? [['', empty], ...Object.entries(categories)] : Object.entries(categories);
  return options.map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`).join('');
}

function categoryLabel(value) {
  return Object.hasOwn(categories, value) ? categories[value] : '其他支出';
}

function amountCents(value) {
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) throw new Error('请填写有效的支出金额，最多两位小数。');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('支出金额应大于 0。');
  return cents;
}

function requestId() {
  return globalThis.crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function proofPath(scope, photo) {
  if (typeof photo?.id !== 'string') return '';
  const expected = '/admin-api' + scope.base + '/photos/' + encodeURIComponent(photo.id);
  return photo.url === expected ? expected : '';
}

function proofsOf(scope, expense) {
  return (expense.images || []).map(photo => ({ id: photo.id, url: proofPath(scope, photo) }));
}

function summaryView(result, filtered) {
  const totals = result.summary;
  const byCategory = new Map((totals.categories || []).map(item => [item.category, item]));
  return `<section class="expense-summary" aria-label="支出统计">
    <div class="expense-total">
      <span>${filtered ? '筛选支出合计' : '当月支出合计'}</span>
      <strong>${money(totals.total)}</strong>
      <small>${h(totals.count)} 笔支出</small>
    </div>
    <div class="expense-breakdown">
      <h3>按类别统计</h3>
      <ul>${Object.entries(categories).map(([key, label]) => {
        const amount = byCategory.get(key)?.amount || 0;
        const width = totals.total > 0 ? Math.min(100, Math.max(0, amount / totals.total * 100)) : 0;
        return `<li>
          <span>${label}</span><span class="expense-track" aria-hidden="true"><i class="expense-bar expense-bar--${key}" style="width:${width}%"></i></span>
          <strong>${money(amount)}</strong>
        </li>`;
      }).join('')}</ul>
    </div>
  </section>`;
}

function listView(result) {
  if (!result.items.length) return '<p class="expense-empty" role="status">当前条件下没有支出记录。</p>';
  const last = Math.max(1, Math.ceil(result.total / result.pageSize));
  const rows = result.items.map(item => `<tr>
    <td data-label="日期"><time datetime="${h(item.date)}">${h(item.date)}</time></td>
    <td data-label="类别"><span class="expense-category">${categoryLabel(item.category)}</span></td>
    <td data-label="支出说明"><strong>${h(item.merchant || item.note || categoryLabel(item.category))}</strong>
      ${item.merchant && item.note ? `<small>${h(item.note)}</small>` : ''}</td>
    <td data-label="经手人">${h(item.handler || '—')}</td>
    <td data-label="金额" class="expense-amount">${money(item.amount)}</td>
    <td data-label="操作"><div class="expense-row-actions">
      ${item.images?.length ? button('凭证 ' + item.images.length, 'proofs', 'text-button', item.id) : ''}
      ${button('编辑', 'edit', 'text-button', item.id)}
      ${button('删除', 'delete', 'text-button text-button-danger', item.id)}
    </div></td>
  </tr>`).join('');
  return `<div class="expense-table-wrap">
    <table class="expense-table">
      <thead><tr><th scope="col">日期</th><th scope="col">类别</th><th scope="col">支出说明</th>
      <th scope="col">经手人</th><th scope="col">金额</th><th scope="col">操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${last > 1 ? `<nav class="expense-pager" aria-label="支出记录分页">
      <span>共 ${h(result.total)} 笔 · 第 ${h(result.page)} / ${last} 页</span>
      <div>
        <button type="button" class="button button-outline" data-expense-action="page" data-id="${result.page - 1}"${result.page === 1 ? ' disabled' : ''}>上一页</button>
        <button type="button" class="button button-outline" data-expense-action="page" data-id="${result.page + 1}"${result.page >= last ? ' disabled' : ''}>下一页</button>
      </div>
    </nav>` : ''}`;
}

export function createMealExpenseWorkspace({ root, handleUnauthorized, showToast }) {
  root.classList.add('meal-expenses');
  root.innerHTML = `<div class="expense-content"></div>
    <dialog class="expense-editor" aria-labelledby="expense-editor-title"></dialog>
    <dialog class="expense-photo" aria-label="支出凭证预览">
      ${button('关闭预览', 'close-photo')}<img alt="支出凭证大图">
    </dialog>`;
  const content = root.querySelector('.expense-content');
  const dialog = root.querySelector('.expense-editor');
  const photoDialog = root.querySelector('.expense-photo');
  const photo = photoDialog.querySelector('img');
  let scope;
  let draft;
  root.hidden = true;

  function updateExportButton() {
    const control = content.querySelector('[data-expense-action="export"]');
    control.disabled = !scope.result || Boolean(scope.loading || scope.error || scope.exporting);
    control.setAttribute('aria-busy', String(Boolean(scope.exporting)));
    control.textContent = scope.exporting ? '正在导出…' : '导出 Excel';
  }

  function render() {
    const { filters, loading, error, result } = scope;
    content.innerHTML = `<header class="expense-heading">
      <div><h2>费用台账</h2><p>按月查看餐食支出和凭证。</p></div>
      <div class="expense-heading-actions">
        ${button('导出 Excel', 'export')}
        ${button('登记支出', 'create', 'button button-primary')}
      </div>
    </header>
    <form class="expense-filters" data-expense-filter>
      <label class="field"><span>月份</span><input type="month" name="month" required value="${h(filters.month)}"></label>
      <label class="field"><span>类别</span><select name="category">${categoryOptions(filters.category, '全部类别')}</select></label>
      <label class="field"><span>关键词</span><input type="search" name="search" placeholder="商家、经手人或备注" maxlength="80" value="${h(filters.search)}"></label>
      <button class="button button-outline" type="submit">查询</button>
    </form>
    ${loading ? '<p class="expense-empty" role="status">正在加载支出记录…</p>' : error ?
      `<div class="expense-empty"><p role="alert">${h(error)}</p>${button('重新加载', 'retry')}</div>` : result ?
      summaryView(result, Boolean(filters.category || filters.search))
      + `<section class="expense-ledger" aria-label="支出明细"><h3>支出明细</h3>${listView(result)}</section>` : ''}`;
    updateExportButton();
  }

  async function load(page = 1) {
    const current = scope;
    const sequence = ++current.sequence;
    const active = () => scope === current && current.sequence === sequence;
    current.loading = true;
    current.error = '';
    render();
    const query = { ...current.filters, pageSize };
    try {
      const fetchPage = (number) => request(current.base + '?' + new URLSearchParams({ ...query, page: number }));
      let result = await fetchPage(page);
      if (!active()) return;
      if (!result.summary || !Array.isArray(result.items) || !Number.isInteger(result.pageSize) || result.pageSize < 1
          || !Number.isInteger(result.total) || result.total < 0) throw new Error('支出数据格式异常，请重试。');
      const last = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (page > last) result = await fetchPage(last);
      if (!active()) return;
      current.result = result;
    } catch (error) {
      if (active() && !handleUnauthorized(error)) current.error = error.message;
    } finally {
      if (active()) {
        current.loading = false;
        render();
      }
    }
  }

  async function exportWorkbook() {
    const current = scope;
    const { filters } = current;
    if (!current.result || current.loading || current.error || current.exporting) return;
    current.exporting = true;
    updateExportButton();
    try {
      const workbook = await request(current.base + '/workbook?' + new URLSearchParams(filters), { workbook: true });
      if (scope !== current) return;
      if (current.filters !== filters) {
        showToast('筛选条件已变更，请重新导出。');
        return;
      }
      downloadFinanceWorkbook(workbook, [current.name, '餐食费用', filters.month]);
    } catch (error) {
      if (scope === current && current.filters === filters && !handleUnauthorized(error)) {
        showToast(error.message || '导出失败，请重试。');
      }
    } finally {
      if (scope === current) {
        current.exporting = false;
        updateExportButton();
      }
    }
  }

  function closeEditor(restoreFocus = true) {
    const previous = draft;
    draft = null;
    if (photoDialog.open) photoDialog.close();
    if (dialog.open) dialog.close();
    for (const item of previous?.proofs || []) {
      if (item.file) URL.revokeObjectURL(item.url);
    }
    if (restoreFocus) previous?.opener?.focus({ preventScroll: true });
  }

  function editorView(title, fields, submit) {
    dialog.innerHTML = `<form class="editor-form" data-expense-editor>
      <header class="editor-head"><div><h2 id="expense-editor-title">${title}</h2><p>${h(scope.name)}</p></div>
        <button type="button" class="editor-close" data-expense-action="close" aria-label="关闭">×</button>
      </header>
      <div class="editor-body">${fields}</div>
      <footer class="editor-foot">
        <p class="form-error" data-expense-error role="alert" hidden></p>
        <div class="editor-actions">
          ${button(submit ? '取消' : '关闭', 'close')}
          ${submit ? `<button type="submit" class="button ${draft.mode === 'delete' ? 'button-danger' : 'button-primary'}">${submit}</button>` : ''}
        </div>
      </footer>
    </form>`;
  }

  function renderProofs() {
    const area = dialog.querySelector('[data-expense-proofs]');
    if (!area) return;
    const editable = draft.mode === 'edit' || draft.mode === 'create';
    area.innerHTML = draft.proofs.map((item, index) => `<div class="expense-proof">
      <button type="button" data-expense-action="preview" data-id="${index}" aria-label="查看第 ${index + 1} 张凭证"${item.url ? '' : ' disabled'}>
        ${item.url ? `<img src="${h(item.url)}" alt="">` : '凭证暂不可用'}
      </button>
      ${editable ? `<button class="expense-proof-remove" type="button" data-expense-action="remove-proof" data-id="${index}" aria-label="移除第 ${index + 1} 张凭证">×</button>` : ''}
    </div>`).join('');
    const count = dialog.querySelector('[data-expense-proof-count]');
    if (count) count.textContent = draft.proofs.length + ' / ' + proofLimit;
    const file = dialog.querySelector('[data-expense-file]');
    if (file) file.disabled = draft.proofs.length >= proofLimit;
  }

  function editView(item) {
    const date = item?.date || dateFormat.format(new Date());
    editorView(item ? '编辑支出' : '登记支出', `<div class="expense-fields">
      <label class="field"><span>日期</span><input type="date" name="date" value="${h(date)}" required></label>
      <label class="field"><span>支出类别</span><select name="category" required>${categoryOptions(item?.category || '', '请选择类别')}</select></label>
      <label class="field"><span>金额（元）</span><input name="amount" inputmode="decimal" placeholder="0.00" maxlength="17" value="${h(decimal(item?.amount))}" required></label>
      <label class="field"><span>经手人（选填）</span><input name="handler" maxlength="40" value="${h(item?.handler)}"></label>
      <label class="field expense-wide"><span>商家或供应商（选填）</span><input name="merchant" maxlength="80" value="${h(item?.merchant)}"></label>
      <label class="field expense-wide"><span>备注（选填）</span><textarea name="note" rows="3" maxlength="500" placeholder="填写采购内容或用途">${h(item?.note)}</textarea></label>
    </div>
    <section class="expense-proof-section" aria-label="支出凭证">
      <div><h3>付款凭证 <small>选填</small></h3><span data-expense-proof-count></span></div>
      <div class="expense-proofs" data-expense-proofs></div>
      <label class="expense-file-add">
        <span class="button button-outline">添加凭证</span>
        <input type="file" data-expense-file accept="image/jpeg,image/png,image/webp" multiple aria-label="添加付款凭证">
      </label>
      <p class="expense-hint">最多 5 张，支持 JPG、PNG、WebP。</p>
    </section>`, '保存支出');
    renderProofs();
  }

  function showError(message) {
    const error = dialog.querySelector('[data-expense-error]');
    if (!error) return;
    error.textContent = message || '';
    error.hidden = !message;
  }

  async function open(mode, id, opener) {
    if (dialog.open) return;
    const current = scope;
    const operation = { mode, id, opener, proofs: [], preparing: false, saving: false };
    draft = operation;
    if (mode === 'create') editView(null);
    else editorView('支出记录', '<p role="status">正在读取…</p>');
    dialog.showModal();
    if (mode === 'create') {
      dialog.querySelector('[name=amount]').focus();
      return;
    }
    try {
      const { expense } = await request(current.base + '/' + encodeURIComponent(id));
      if (draft !== operation || scope !== current) return;
      operation.expense = expense;
      operation.proofs = proofsOf(current, expense);
      if (mode === 'edit') {
        editView(expense);
        dialog.querySelector('[name=amount]').focus();
      } else if (mode === 'delete') {
        editorView('删除支出', `<div class="expense-delete-summary">
          <strong>${h(expense.date)} · ${categoryLabel(expense.category)} · ${money(expense.amount)}</strong>
          <p>删除后，该笔支出会从明细移除，合计也会重新计算。</p>
        </div>`, '确认删除');
      } else {
        editorView('付款凭证', `<section class="expense-proof-section">
          <div><h3>${h(expense.date)} · ${categoryLabel(expense.category)}</h3><strong>${money(expense.amount)}</strong></div>
          <div class="expense-proofs" data-expense-proofs></div>
        </section>`);
        renderProofs();
      }
    } catch (error) {
      if (draft === operation && scope === current && !handleUnauthorized(error)) {
        editorView('支出记录', `<p class="form-error" role="alert">${h(error.message)}</p>`);
      }
    }
  }

  async function addProofs(input) {
    const operation = draft;
    if (!operation || operation.preparing || operation.saving) return;
    const files = [...input.files].slice(0, proofLimit - operation.proofs.length);
    const extra = input.files.length > files.length;
    input.value = '';
    if (!files.length) return;
    operation.preparing = true;
    const submit = dialog.querySelector('[type=submit]');
    submit.disabled = true;
    input.disabled = true;
    showError('');
    let photoError = '';
    try {
      for (const file of files) {
        try {
          const prepared = await prepareProofImage(file);
          if (draft !== operation) return;
          operation.proofs.push({ file: prepared, url: URL.createObjectURL(prepared) });
        } catch (error) {
          photoError = error.message;
        }
      }
    } finally {
      if (draft === operation) {
        operation.preparing = false;
        submit.disabled = false;
        renderProofs();
        showError(photoError || (extra ? '最多可添加 5 张凭证。' : ''));
      }
    }
  }

  async function save(form) {
    const operation = draft;
    if (!operation || operation.saving || operation.preparing) return;
    const current = scope;
    const expense = operation.expense;
    const deleting = operation.mode === 'delete';
    const fields = new FormData(form);
    const value = name => String(fields.get(name) || '').trim();
    const endpoint = expense ? current.base + '/' + encodeURIComponent(expense.id) : current.base;
    const submit = form.querySelector('[type=submit]');
    if (!submit) return;
    const submitLabel = submit.textContent;
    const controls = [...form.elements].filter(control => !control.disabled);
    try {
      const values = deleting ? null : {
        date: value('date'), category: value('category'), amount: amountCents(value('amount')),
        merchant: value('merchant'), handler: value('handler'), note: value('note'),
      };
      operation.saving = true;
      controls.forEach(control => { control.disabled = true; });
      submit.textContent = deleting ? '正在删除…' : '正在保存…';
      form.setAttribute('aria-busy', 'true');
      showError('');
      if (deleting) {
        await request(endpoint, { method: 'DELETE', body: { revision: expense.revision } });
      } else {
        for (const item of operation.proofs) {
          if (item.id) continue;
          const upload = new FormData();
          upload.append('file', item.file);
          const proof = await request(current.base + '/photos', { method: 'POST', body: upload });
          if (draft !== operation || scope !== current) return;
          if (!/^[a-f\d]{32}$/i.test(proof.id || '')) throw new Error('凭证上传未完成，请重试。');
          item.id = proof.id;
        }
        const payload = { ...values, assetIds: operation.proofs.map(item => item.id), ...(expense ? { revision: expense.revision } : {}) };
        const fingerprint = JSON.stringify(payload);
        if (operation.fingerprint !== fingerprint) {
          operation.fingerprint = fingerprint;
          operation.requestId = requestId();
        }
        try {
          await request(endpoint, { method: expense ? 'PATCH' : 'POST', body: { ...payload, requestId: operation.requestId } });
        } catch (error) {
          if (error.code === 'INVALID_UPLOAD' && draft === operation) {
            for (const item of operation.proofs) {
              if (item.file) delete item.id;
            }
          }
          throw error;
        }
      }
      if (draft !== operation || scope !== current) return;
      closeEditor(false);
      showToast(deleting ? '支出已删除' : '支出已保存');
      const movedMonth = !deleting && values.date.slice(0, 7) !== current.filters.month;
      if (movedMonth) {
        current.filters = { month: values.date.slice(0, 7), search: '', category: '' };
      }
      await load(expense && !movedMonth ? current.result?.page || 1 : 1);
      if (scope === current) content.querySelector('[data-expense-action=create]')?.focus({ preventScroll: true });
    } catch (error) {
      if (draft === operation && scope === current && !handleUnauthorized(error)) {
        showError(error.message);
      }
    } finally {
      if (draft === operation) {
        operation.saving = false;
        controls.forEach(control => { control.disabled = false; });
        submit.textContent = submitLabel;
        form.removeAttribute('aria-busy');
      }
    }
  }

  root.addEventListener('submit', event => {
    if (event.target.matches('[data-expense-filter]')) {
      event.preventDefault();
      const form = new FormData(event.target);
      scope.filters = { month: form.get('month'), category: form.get('category'), search: form.get('search').trim() };
      void load();
    } else if (event.target.matches('[data-expense-editor]')) {
      event.preventDefault();
      void save(event.target);
    }
  });

  root.addEventListener('change', event => {
    if (event.target.matches('[data-expense-file]')) void addProofs(event.target);
  });

  root.addEventListener('click', event => {
    const buttonNode = event.target.closest('[data-expense-action]');
    if (!buttonNode || !scope) return;
    const { expenseAction, id } = buttonNode.dataset;
    if (['create', 'edit', 'delete', 'proofs'].includes(expenseAction)) {
      void open(expenseAction, id, buttonNode);
    } else if (expenseAction === 'export') {
      void exportWorkbook();
    } else if (expenseAction === 'retry' || expenseAction === 'page') {
      void load(Number(id) || scope.result?.page || 1);
    } else if (expenseAction === 'close') {
      if (!draft?.saving) closeEditor();
    } else if (expenseAction === 'remove-proof' && !draft?.saving && !draft?.preparing) {
      const [removed] = draft.proofs.splice(Number(id), 1);
      if (removed?.file) URL.revokeObjectURL(removed.url);
      renderProofs();
    } else if (expenseAction === 'preview') {
      const url = draft?.proofs[Number(id)]?.url;
      if (!url) return;
      photo.src = url;
      photoDialog.showModal();
    } else if (expenseAction === 'close-photo') {
      photoDialog.close();
    }
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!draft?.saving) closeEditor();
  });
  photoDialog.addEventListener('close', () => photo.removeAttribute('src'));

  return {
    show({ organizationId, organizationName }) {
      if (scope?.id === organizationId && !root.hidden) return;
      closeEditor(false);
      scope = {
        id: organizationId, name: organizationName, base: '/organizations/' + encodeURIComponent(organizationId) + '/meals/expenses',
        filters: { month: dateFormat.format(new Date()).slice(0, 7), search: '', category: '' }, sequence: 0,
      };
      root.hidden = false;
      return load();
    },
    hide() {
      closeEditor(false);
      scope = null;
      root.hidden = true;
      content.textContent = '';
    },
  };
}
