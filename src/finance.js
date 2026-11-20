import './finance.css';
import { request } from './api.js';
import { prepareProofImage as proofFile } from './proof-image.js';
import { createFinanceOverview } from './finance-overview.js';
import { downloadFinanceWorkbook } from './finance-overview-export.js';
import {
  billStatuses, decimal, financePageSize, financeProofLimit, paymentOutcome, renderBatchForm, renderBatchSelection,
  renderBill, renderCandidatePage, renderDraftProofs, renderDueForm, renderEventForm, renderHistory, renderRemoveBill, renderStageForm, renderStageSettings,
  stageBoard, stageList,
} from './finance-views.js';
import { escapeHtml as h } from './views.js';

const stagePageSize = 8;

function listState() {
  return { data: null, loaded: false, loading: false, error: '', version: 0 };
}

function today() {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
  }).formatToParts();
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return [values.year, values.month, values.day].join('-');
}

function cents(value, label, allowZero = true) {
  const input = String(value ?? '').trim();
  if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(input)) throw new Error(`请填写有效的${label}，最多两位小数。`);
  const [whole, part = ''] = input.split('.');
  const amount = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || (!allowZero && amount <= 0)) throw new Error(`${label}超出有效范围。`);
  return amount;
}

function textValue(fields, field) {
  return String(fields.get(field) ?? '').trim();
}

function stageValues(fields) {
  const name = textValue(fields, 'name');
  if (!name) throw new Error('请填写收费阶段名称。');
  const startDate = textValue(fields, 'startDate');
  const endDate = textValue(fields, 'endDate');
  const reference = textValue(fields, 'referenceAmount');
  return { name, startDate: startDate || null, endDate: endDate || null, referenceAmount: reference ? cents(reference, '参考价') : null };
}

function syncStageDateRange(form) {
  const notice = form?.querySelector('[data-fin-stage-date-error]');
  if (!notice) return true;
  const { startDate, endDate } = form.elements;
  startDate.max = endDate.value;
  endDate.min = startDate.value;
  const message = endDate.valueAsNumber < startDate.valueAsNumber ? '结束日期不能早于开始日期。' : '';
  for (const field of [startDate, endDate]) {
    field.setCustomValidity(message);
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  if (notice.textContent !== message) notice.textContent = message;
  notice.hidden = !message;
  return !message;
}

function makeRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
}

export function createFinanceWorkspace({ root, handleUnauthorized, showToast }) {
  root.classList.add('finance-workspace');
  root.innerHTML = `<div class="fin-content"></div><dialog class="fin-dialog" aria-label="账单管理"></dialog>
    <dialog class="fin-preview" aria-label="凭证预览"><button type="button" class="editor-close" aria-label="关闭预览" data-fin-action="close-proof">×</button>
      <img alt="收退款凭证大图"></dialog>`;
  const content = root.querySelector('.fin-content');
  const dialog = root.querySelector('.fin-dialog');
  const photoDialog = root.querySelector('.fin-preview');
  const overviewRoot = document.createElement('div');
  const overview = createFinanceOverview({ root: overviewRoot, handleUnauthorized });

  let workspace;
  let operation;
  let opener;
  root.hidden = true;

  async function queryList(scope, record, url, params, isCurrent, redraw) {
    const version = ++record.version;
    const current = () => workspace === scope && isCurrent() && record.version === version;
    record.loading = true;
    record.error = '';
    redraw();
    try {
      const result = await request(scope.base + url + '?' + new URLSearchParams(params));
      if (!current()) return false;
      if (!Array.isArray(result.items) || !Number.isSafeInteger(result.page) || !Number.isSafeInteger(result.total)
        || !Number.isSafeInteger(result.pageSize) || result.pageSize <= 0) {
        throw new Error('列表格式异常，请重试。');
      }
      record.data = result;
      record.loaded = true;
      return true;
    } catch (error) {
      if (current() && !handleUnauthorized(error)) record.error = error.message;
      return false;
    } finally {
      if (current()) {
        record.loading = false;
        redraw();
      }
    }
  }

  function renderStages() {
    const region = content.querySelector('[data-fin-stages]');
    if (workspace && region) region.innerHTML = stageList(workspace.stages, workspace.stage?.id);
  }

  function syncStageSettings(savedForm) {
    const region = content.querySelector('[data-fin-stage-settings]');
    if (!region || !workspace?.stage) return;
    const stage = workspace.stage;
    if (region.firstElementChild?.dataset.stageId !== stage.id) region.innerHTML = renderStageSettings(stage);
    const form = region.firstElementChild;
    form.querySelector('h2').textContent = stage.name;
    const saving = workspace.stageWrites.has(stage.id);
    const values = { name: stage.name, startDate: stage.startDate || '', endDate: stage.endDate || '', referenceAmount: decimal(stage.referenceAmount) };
    for (const [name, value] of Object.entries(values)) {
      const field = form.elements[name];
      field.disabled = saving;
      if (form !== savedForm && (field.value !== field.defaultValue || field === document.activeElement)) continue;
      field.defaultValue = value;
      field.value = value;
    }
    syncStageDateRange(form);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = saving;
    submit.textContent = saving ? '正在保存…' : '保存修改';
  }

  function renderBoard() {
    const region = content.querySelector('[data-fin-board]');
    if (!workspace || !region) return;
    syncStageSettings();
    const search = region.querySelector('input[name="search"]');
    const activeFilter = region.contains(document.activeElement) ? document.activeElement.name : '';
    const userSearch = search?.value;
    region.innerHTML = stageBoard(workspace.bills, workspace.stage, workspace.filters);
    const nextSearch = region.querySelector('input[name="search"]');
    if (nextSearch && userSearch !== undefined) nextSearch.value = userSearch;
    if (activeFilter === 'search' || activeFilter === 'status') {
      region.querySelector(`[name="${activeFilter}"]`)?.focus({ preventScroll: true });
    }
  }

  async function loadStages(page = 1, preferred = undefined) {
    const scope = workspace;
    if (!scope) return;
    const loaded = await queryList(scope, scope.stages, '/stages', { page, pageSize: stagePageSize }, () => true, renderStages);
    if (!loaded || workspace !== scope) return;
    const items = scope.stages.data.items;
    if (preferred) return selectStage(preferred);
    if (!scope.stage && items.length) return selectStage(items[0]);
    const refreshed = items.find(item => item.id === scope.stage?.id);
    if (refreshed) {
      scope.stage = refreshed;
      renderBoard();
    }
  }

  async function loadBills(page = workspace?.bills.data?.page || 1) {
    const scope = workspace;
    const stage = scope?.stage;
    if (!stage) return;
    const filters = scope.filters;
    const loaded = await queryList(scope, scope.bills, '/stages/' + encodeURIComponent(stage.id) + '/bills', {
      page, pageSize: financePageSize, search: filters.search, status: filters.status,
    }, () => scope.stage?.id === stage.id, renderBoard);
    if (!loaded || workspace !== scope || scope.stage?.id !== stage.id) return;
    const result = scope.bills.data;
    const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
    if (result.page > lastPage) return loadBills(lastPage);
    if (result.stage?.id === stage.id) {
      scope.stage = result.stage;
      renderStages();
      renderBoard();
    }
  }

  function selectStage(stage) {
    if (!stage || !workspace) return;
    const changed = workspace.stage?.id !== stage.id;
    workspace.stage = stage;
    if (changed) {
      workspace.bills.version++;
      workspace.bills = listState();
      workspace.filters = { search: '', status: '', exporting: false };
      const region = content.querySelector('[data-fin-board]');
      if (region) region.textContent = '';
    }
    renderStages();
    renderBoard();
    return loadBills(changed ? 1 : workspace.bills.data?.page || 1);
  }

  function renderWorkspace() {
    const scope = workspace;
    content.innerHTML = `<header class="organization-heading fin-heading" aria-labelledby="fin-title">
      <div><p>${h(scope.name)}</p><h1 id="fin-title">财务管理</h1></div>
      <button class="button button-primary" type="button" data-fin-action="new-stage">创建收费阶段</button></header>
      <div class="fin-mode-tabs" role="tablist" aria-label="财务功能">
        <button type="button" id="fin-tab-overview" role="tab" aria-controls="fin-panel-overview"
          aria-selected="false" tabindex="-1" data-fin-action="finance-tab" data-key="overview">财务总览</button>
        <button type="button" id="fin-tab-billing" role="tab" aria-controls="fin-panel-billing"
          aria-selected="true" data-fin-action="finance-tab" data-key="billing">收费</button>
      </div>
      <div id="fin-panel-overview" role="tabpanel" aria-labelledby="fin-tab-overview" hidden></div>
      <div id="fin-panel-billing" class="fin-layout" role="tabpanel" aria-labelledby="fin-tab-billing">
        <aside class="records fin-stages" aria-labelledby="fin-stages-title">
        <h2 id="fin-stages-title">收费阶段</h2><div data-fin-stages></div>
        </aside><section class="fin-board" aria-label="收费阶段账单">
          <div data-fin-stage-settings></div><div data-fin-board></div>
        </section>
      </div>`;
    content.querySelector('#fin-panel-overview').append(overviewRoot);
    renderStages();
    renderBoard();
  }

  function selectFinanceTab(key, focus = false) {
    if (!['overview', 'billing'].includes(key) || !workspace || workspace.historyOnly) return;
    for (const tab of content.querySelectorAll('[role="tab"]')) {
      const selected = tab.dataset.key === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      content.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    content.querySelector('[data-fin-action="new-stage"]').hidden = key !== 'billing';
    if (key === 'overview') void overview.show({ organizationId: workspace.id, organizationName: workspace.name });
  }

  function show({ organizationId, organizationName }) {
    if (!organizationId) {
      hide();
      return;
    }
    if (workspace?.id === organizationId && !root.hidden) return workspace.ready;
    hide();
    const scope = {
      id: organizationId, name: organizationName || '',
      base: '/organizations/' + encodeURIComponent(organizationId) + '/finance',
      stages: listState(), bills: listState(), stage: null, stageWrites: new Set(),
      filters: { search: '', status: '', exporting: false },
    };
    workspace = scope;
    root.hidden = false;
    content.hidden = false;
    renderWorkspace();
    scope.ready = loadStages();
    return scope.ready;
  }

  function hide() {
    overview.hide();
    workspace = null;
    closeOperation(true);
    root.hidden = true;
    content.textContent = '';
  }

  function renderOperation() {
    if (!operation) return;
    dialog.removeAttribute('aria-busy');
    const renderers = {
      stage: renderStageForm, 'remove-bill': renderRemoveBill, batch: renderBatchForm,
      bill: renderBill, history: renderHistory, due: renderDueForm,
      event: item => renderEventForm(item, today()),
    };
    dialog.innerHTML = renderers[operation.kind](operation);
    dialog.setAttribute('aria-label', dialog.querySelector('h2').textContent);
  }

  function resetFocus() {
    const firstField = dialog.querySelector('.fin-dialog-body input:not([type=file]), .fin-candidate-search input');
    (firstField || dialog.querySelector('.editor-close'))?.focus({ preventScroll: true });
  }

  function present(next, anchor) {
    if (!dialog.open) opener = anchor || document.activeElement;
    if (operation !== next) releaseDraftProofs();
    operation = next;
    renderOperation();
    if (!dialog.open) dialog.showModal();
    resetFocus();
  }

  function closeOperation(force = false) {
    if (operation?.saving && !force) return;
    releaseDraftProofs();
    operation = null;
    if (photoDialog.open) photoDialog.close();
    photoDialog.querySelector('img').removeAttribute('src');
    if (dialog.open) dialog.close();
    dialog.removeAttribute('aria-busy');
    dialog.innerHTML = '';
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    if (workspace?.historyOnly) {
      workspace = null;
      root.hidden = true;
    }
  }

  function back() {
    if (operation?.saving) return;
    const parent = operation?.parent;
    if (!parent) return closeOperation();
    present(parent);
    if (parent.kind === 'history') void loadRecords(parent);
  }

  function openRecord(kind, key, anchor) {
    if (!workspace || !key) return;
    const next = { kind, key, results: listState(), parent: kind === 'bill' && operation?.kind === 'history' ? operation : null };
    present(next, anchor);
    void loadRecords(next);
  }

  function openStudent(studentId, { organizationId, anchor } = {}) {
    if (organizationId && studentId) {
      hide();
      workspace = { id: organizationId, base: '/organizations/' + encodeURIComponent(organizationId) + '/finance', historyOnly: true };
      content.hidden = true;
      root.hidden = false;
    }
    openRecord('history', studentId, anchor);
  }

  async function loadRecords(current, page = current.results.data?.page || 1) {
    const scope = workspace;
    const key = encodeURIComponent(current.key);
    const url = current.kind === 'history' ? `/students/${key}/history` : `/bills/${key}/events`;
    await queryList(scope, current.results, url, { page, pageSize: financePageSize },
      () => operation === current, renderOperation);
  }

  function syncCandidateActions() {
    const { students, results, saving } = operation;
    dialog.querySelector('[data-fin-action="select-candidate-page"]').disabled = saving || results.loading || Boolean(results.error)
      || !results.data?.items.some(student => !students.has(student.id));
    dialog.querySelector('[data-fin-action="clear-candidates"]').disabled = saving || students.size === 0;
  }

  function renderCandidateResults() {
    const region = dialog.querySelector('[data-fin-candidates]');
    if (!region || operation?.kind !== 'batch') return;
    region.innerHTML = renderCandidatePage(operation);
    syncCandidateActions();
  }

  function renderSelected() {
    const region = dialog.querySelector('[data-fin-draft]');
    if (!region || operation?.kind !== 'batch') return;
    region.innerHTML = renderBatchSelection(operation.students);
    dialog.querySelector('[data-fin-selected-count]').textContent = operation.students.size;
    syncCandidateActions();
  }

  function selectCandidate(current, student) {
    if (!current.students.has(student.id)) {
      current.students.set(student.id, { student, amount: decimal(current.stage.referenceAmount) });
    }
  }

  function changeCandidatePage(action) {
    const current = operation;
    if (current?.kind !== 'batch' || current.saving) return;
    if (action === 'select-candidate-page') {
      if (current.results.loading || current.results.error) return;
      for (const student of current.results.data?.items || []) selectCandidate(current, student);
    } else current.students.clear();
    renderCandidateResults();
    renderSelected();
  }

  function loadCandidates(current, page = current.results.data?.page || 1) {
    return queryList(workspace, current.results, '/students', {
      search: current.search, stageId: current.stage.id, page, pageSize: financePageSize,
    }, () => operation === current, renderCandidateResults);
  }

  function openBatch(stage, anchor) {
    const next = { kind: 'batch', stage, students: new Map(), results: listState(), search: '' };
    present(next, anchor);
    void loadCandidates(next);
  }

  function openEvent(type, anchor) {
    const bill = operation?.results.data?.bill;
    if (!bill || bill.removed) return;
    if (type === 'payment' && bill.balance <= 0) return;
    const target = type === 'reversal' ? operation.results.data.items.find(item => item.id === anchor.dataset.key) : null;
    if (type === 'reversal' && !target) return;
    present({ kind: 'event', parent: operation, type, bill, target, photos: [] });
  }

  function releaseDraftProofs() {
    for (const photo of operation?.photos || []) URL.revokeObjectURL(photo.url);
  }

  function renderProofSelection(current) {
    const count = dialog.querySelector('[data-fin-proof-count]');
    const tiles = dialog.querySelector('[data-fin-draft-proofs]');
    const input = dialog.querySelector('input[name="photo"]');
    const submit = dialog.querySelector('[data-fin-submit]');
    tiles.innerHTML = renderDraftProofs(current.photos);
    count.textContent = current.preparingProofs ? '正在处理凭证图片…' : `已选 ${current.photos.length} / ${financeProofLimit} 张`;
    input.disabled = current.preparingProofs || current.photos.length >= financeProofLimit;
    submit.disabled = Boolean(current.preparingProofs);
  }

  function proofError(message = '') {
    const error = dialog.querySelector('[data-fin-proof-error]');
    error.textContent = message;
    error.hidden = !message;
  }

  async function addDraftProofs(input) {
    const current = operation;
    if (!current?.photos || current.saving || current.preparingProofs) return;
    const selected = [...input.files];
    input.value = '';
    if (!selected.length) return;
    proofError();
    if (current.photos.length + selected.length > financeProofLimit) {
      proofError(`每笔最多上传 ${financeProofLimit} 张凭证，请减少选择的图片。`);
      return;
    }
    current.preparingProofs = true;
    renderProofSelection(current);
    try {
      const files = await Promise.all(selected.map(proofFile));
      if (operation !== current) return;
      current.photos.push(...files.map(file => ({ file, url: URL.createObjectURL(file) })));
    } catch (error) {
      if (operation === current) proofError(error.message);
    } finally {
      current.preparingProofs = false;
      if (operation === current) renderProofSelection(current);
    }
  }

  function removeDraftProof(key) {
    const index = Number(key);
    const photo = operation?.photos?.[index];
    if (!photo || operation.saving) return;
    URL.revokeObjectURL(photo.url);
    operation.photos.splice(index, 1);
    proofError();
    renderProofSelection(operation);
    const buttons = dialog.querySelectorAll('[data-fin-action="remove-proof"]');
    (buttons[Math.min(index, buttons.length - 1)] || dialog.querySelector('input[name="photo"]')).focus();
  }

  function openProofImage(url) {
    photoDialog.querySelector('img').src = url;
    if (!photoDialog.open) photoDialog.showModal();
  }

  function showProof(rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl, window.location.origin);
    } catch {
      return;
    }
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith('/admin-api/')) return;
    openProofImage(parsed.href);
  }

  async function exportStage(button) {
    const scope = workspace;
    const { stage, filters } = scope;
    if (filters.exporting || !stage) return;
    const { search, status } = filters;
    filters.exporting = true;
    button.disabled = true;
    button.textContent = '正在导出…';
    try {
      const params = new URLSearchParams({ search, status });
      const workbook = await request(scope.base + '/stages/' + encodeURIComponent(stage.id) + '/workbook?' + params, { workbook: true });
      if (workspace !== scope || scope.stage?.id !== stage.id || content.querySelector('#fin-panel-billing').hidden) return;
      if (filters.search !== search || filters.status !== status) {
        showToast('筛选条件已变更，请重新导出。');
        return;
      }
      downloadFinanceWorkbook(workbook, [stage.name, '账单']);
    } catch (error) {
      if (workspace === scope && !handleUnauthorized(error)) showToast(error.message || '导出失败。');
    } finally {
      filters.exporting = false;
      if (workspace === scope) renderBoard();
    }
  }

  function showError(message) {
    const area = dialog.querySelector('[data-fin-error]');
    if (area) {
      area.textContent = message;
      area.hidden = !message;
    }
  }

  async function save(current, complete) {
    const scope = workspace;
    if (!scope || !current || current.saving) return;
    current.saving = true;
    showError('');
    const controls = [...dialog.querySelectorAll('button, input, textarea, select')].filter(item => !item.disabled);
    const submit = dialog.querySelector('[data-fin-submit]');
    const label = submit?.textContent;
    for (const item of controls) item.disabled = true;
    dialog.setAttribute('aria-busy', 'true');
    if (submit) submit.textContent = '正在保存…';
    try {
      await complete(scope);
    } catch (error) {
      if (operation === current && workspace === scope && !handleUnauthorized(error)) {
        showError(error.message || '保存失败，请重试。');
      }
    } finally {
      current.saving = false;
      if (operation === current) dialog.removeAttribute('aria-busy');
      for (const item of controls) item.disabled = false;
      if (submit) submit.textContent = label;
      if (operation === current && current.kind === 'batch') syncCandidateActions();
    }
  }

  function finish(scope, current, message, follow) {
    if (workspace !== scope || operation !== current) return;
    current.saving = false;
    closeOperation();
    showToast(message);
    void overview.refresh();
    return follow();
  }

  function saveStage(current, fields) {
    return save(current, async scope => {
      const result = await request(scope.base + '/stages', { method: 'POST', body: stageValues(fields) });
      return finish(scope, current, '收费阶段已保存', () => loadStages(1, result.stage));
    });
  }

  async function updateStage(form, fields) {
    const scope = workspace;
    const id = scope?.stage?.id;
    if (!id || id !== form.dataset.stageId || scope.stageWrites.has(id)) return;
    const errorRegion = form.querySelector('[data-fin-stage-error]');
    errorRegion.hidden = true;
    let saved = false;
    try {
      const values = stageValues(fields);
      const defaults = stageValues(new Map(Object.keys(values).map(name => [name, form.elements[name].defaultValue])));
      const updates = Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== defaults[name]));
      if (!Object.keys(updates).length) return;
      scope.stageWrites.add(id);
      syncStageSettings();
      const { stage } = await request(scope.base + '/stages/' + encodeURIComponent(id), { method: 'PATCH', body: updates });
      if (workspace !== scope) return;
      if (scope.stages.data) scope.stages.data.items = scope.stages.data.items.map(item => item.id === id ? stage : item);
      if (scope.stage.id === id) {
        scope.stage = stage;
        saved = true;
        void loadBills();
      }
      renderStages();
      showToast('收费阶段已保存');
      void overview.refresh();
    } catch (error) {
      if (workspace !== scope || handleUnauthorized(error)) return;
      if (form.isConnected) {
        errorRegion.textContent = error.message;
        errorRegion.hidden = false;
      } else showToast(error.message);
    } finally {
      scope.stageWrites.delete(id);
      if (workspace === scope) syncStageSettings(saved ? form : undefined);
    }
  }

  function openRemoveBill(id, anchor) {
    const parent = operation?.kind === 'bill' ? operation : null;
    const bill = parent?.results.data?.bill || workspace.bills.data?.items.find(item => item.id === id);
    if (bill?.id === id && !bill.removed) present({ kind: 'remove-bill', bill, parent }, anchor);
  }

  function removeBill(current) {
    if (current?.bill.net !== 0) return;
    return save(current, async scope => {
      const { bill } = await request(scope.base + '/bills/' + encodeURIComponent(current.bill.id), { method: 'DELETE' });
      if (workspace !== scope || operation !== current) return;
      current.saving = false;
      if (current.parent) {
        current.parent.results.data.bill = bill;
        present(current.parent);
        void loadRecords(current.parent, 1);
      } else closeOperation();
      if (scope.stage?.id === current.bill.stageId) void loadBills();
      showToast('学生已从本阶段移除');
      void overview.refresh();
    });
  }

  function saveBatch(current) {
    return save(current, async scope => {
      if (!current.students.size) throw new Error('请选择至少一名学生。');
      const items = [...current.students].map(([studentId, item]) => ({ studentId, due: cents(item.amount, item.student.name + '的应收金额') }));
      const path = '/stages/' + encodeURIComponent(current.stage.id) + '/bills';
      await request(scope.base + path, { method: 'POST', body: { items } });
      return finish(scope, current, `已创建 ${items.length} 张账单`, () => loadBills(1));
    });
  }

  function eventBody(current, fields) {
    const type = current.type;
    const note = textValue(fields, 'note');
    const date = textValue(fields, 'date');
    const photos = current.photos;
    const body = new FormData();
    const values = { type, date, note };
    if (type === 'reversal') values.targetId = current.target.id;
    else {
      values.amount = cents(textValue(fields, 'amount'), type === 'refund' ? '退款金额' : '收款金额', false);
      values.method = textValue(fields, 'method');
      if (type === 'payment') {
        const balance = current.bill.balance;
        if (values.amount > balance) throw new Error(paymentOutcome(balance, values.amount, false));
        values.fullPayment = fields.get('fullPayment') === 'true';
        values.expectedBalance = balance;
      }
    }
    const signature = JSON.stringify([values, photos.map(photo => photo.url)]);
    if (current.upload?.signature !== signature) {
      current.upload = { signature, requestId: makeRequestId() };
    }
    for (const [key, value] of Object.entries({ ...values, requestId: current.upload.requestId })) body.append(key, String(value));
    for (const { file } of photos) body.append('photo', file, file.name);
    return body;
  }

  function saveBill(current, fields) {
    if (current.preparingProofs) return;
    return save(current, async scope => {
      const path = '/bills/' + encodeURIComponent(current.bill.id);
      if (current.kind === 'due') {
        const note = textValue(fields, 'note');
        if (!note) throw new Error('请填写调整原因。');
        await request(scope.base + path, { method: 'PATCH', body: { due: cents(textValue(fields, 'due'), '应收金额'), note } });
      } else {
        const body = eventBody(current, fields);
        if (workspace !== scope || operation !== current) return;
        await request(scope.base + path + '/events', { method: 'POST', body });
      }
      if (workspace !== scope || operation !== current) return;
      current.saving = false;
      present(current.parent);
      void loadRecords(current.parent, 1);
      if (scope.stage?.id === current.bill.stageId) void loadBills();
      showToast(current.kind === 'due' ? '应收金额已更新' : '账单流水已保存');
      void overview.refresh();
    });
  }

  function refreshPaymentOutcome(form) {
    const result = form?.querySelector('[data-fin-payment-summary]');
    if (!result) return;
    let amount;
    try { amount = cents(form.elements.amount.value, '收款金额', false); } catch {}
    result.textContent = paymentOutcome(operation.bill.balance, amount, form.elements.fullPayment.checked);
  }

  root.addEventListener('submit', event => {
    const type = event.target.dataset.finForm;
    if (!type) return;
    event.preventDefault();
    event.stopPropagation();
    if ((type === 'stage' || type === 'stage-update') && !syncStageDateRange(event.target)) return;
    const fields = new FormData(event.target);
    if (type === 'bill-search') {
      const status = textValue(fields, 'status');
      workspace.filters.search = textValue(fields, 'search');
      workspace.filters.status = Object.hasOwn(billStatuses, status) ? status : '';
      void loadBills(1);
    } else if (type === 'candidate-search') {
      operation.search = textValue(fields, 'search');
      void loadCandidates(operation, 1);
    } else if (type === 'stage') void saveStage(operation, fields);
    else if (type === 'stage-update') void updateStage(event.target, fields);
    else if (type === 'remove-bill') void removeBill(operation);
    else if (type === 'batch') void saveBatch(operation);
    else if (type === 'due' || type === 'event') void saveBill(operation, fields);
  });

  root.addEventListener('change', event => {
    if (event.target.name === 'startDate' || event.target.name === 'endDate') {
      syncStageDateRange(event.target.form);
    }
    if (operation?.type === 'payment' && event.target.name === 'fullPayment') {
      refreshPaymentOutcome(event.target.form);
      return;
    }
    if (operation?.kind === 'event' && event.target.name === 'photo') {
      void addDraftProofs(event.target);
      return;
    }
    if (operation?.kind !== 'batch' || event.target.name !== 'candidate') return;
    const id = event.target.value;
    if (event.target.checked) {
      const student = operation.results.data?.items.find(item => item.id === id);
      if (student) selectCandidate(operation, student);
    } else operation.students.delete(id);
    renderSelected();
  });
  root.addEventListener('input', event => {
    if (event.target.name === 'startDate' || event.target.name === 'endDate') {
      syncStageDateRange(event.target.form);
    }
    if (operation?.type === 'payment' && event.target.name === 'amount') {
      refreshPaymentOutcome(event.target.form);
      return;
    }
    if (operation?.kind !== 'batch') return;
    const entry = operation.students.get(event.target.dataset.finDue);
    if (entry) entry.amount = event.target.value;
  });

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-fin-action]');
    if (!button || !workspace) return;
    event.stopPropagation();
    const { finAction: kind, key } = button.dataset;
    const { stage, stages, bills } = workspace;
    const targets = {
      'finance-tab': () => selectFinanceTab(key),
      'new-stage': () => present({ kind: 'stage' }, button),
      'reload-stages': () => loadStages(stages.data?.page || 1),
      'stage-page': () => loadStages(Number(key)),
      'select-stage': () => selectStage(stages.data?.items.find(item => item.id === key)),
      'reload-bills': () => loadBills(bills.data?.page || 1),
      'bill-page': () => loadBills(Number(key)),
      'export-stage': () => exportStage(button),
      'create-batch': () => openBatch(stage, button),
      'reload-candidates': () => loadCandidates(operation),
      'candidate-page': () => loadCandidates(operation, Number(key)),
      'select-candidate-page': () => changeCandidatePage(kind),
      'clear-candidates': () => changeCandidatePage(kind),
      'remove-candidate': () => {
        operation.students.delete(key);
        renderSelected();
        renderCandidateResults();
      },
      'open-bill': () => openRecord('bill', key, button),
      'open-student': () => openRecord('history', key, button),
      'remove-bill': () => openRemoveBill(key, button),
      'reload-dialog': () => loadRecords(operation),
      'dialog-page': () => loadRecords(operation, Number(key)),
      'edit-due': () => {
        const bill = operation.results.data.bill;
        if (!bill.removed) present({ kind: 'due', parent: operation, bill });
      },
      payment: () => openEvent('payment', button),
      refund: () => openEvent('refund', button),
      reversal: () => openEvent('reversal', button),
      proof: () => showProof(key),
      'draft-proof': () => {
        const photo = operation?.photos?.[Number(key)];
        if (photo) openProofImage(photo.url);
      },
      'remove-proof': () => removeDraftProof(key),
      'close-proof': () => photoDialog.close(),
      back,
      close: () => closeOperation(),
    };
    targets[kind]?.();
  });

  root.addEventListener('keydown', event => {
    const tab = event.target.closest('[data-fin-action="finance-tab"]');
    if (!tab) return;
    if (event.key === 'Home') selectFinanceTab('overview', true);
    else if (event.key === 'End') selectFinanceTab('billing', true);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      selectFinanceTab(tab.dataset.key === 'overview' ? 'billing' : 'overview', true);
    } else return;
    event.preventDefault();
  });

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    back();
  });
  photoDialog.addEventListener('close', () => {
    if (!photoDialog.open) photoDialog.querySelector('img').removeAttribute('src');
  });

  return { show, hide, openStudent };
}
