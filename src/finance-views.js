import { escapeHtml as h } from './views.js';

export const billStatuses = { unpaid: '待缴费', partial: '部分缴费', paid: '已结清' };
export const paymentMethods = { wechat: '微信', alipay: '支付宝', bank: '银行转账', cash: '现金', other: '其他' };
export const eventTypes = { created: '创建账单', adjustment: '调整应收', payment: '收款', refund: '退款', reversal: '冲正', removed: '移除学生', restored: '恢复账单' };
export const financePageSize = 20;
export const financeProofLimit = 5;

export function decimal(cents) {
  if (!Number.isSafeInteger(cents)) return '';
  const magnitude = Math.abs(cents);
  return (cents < 0 ? '-' : '') + Math.floor(magnitude / 100) + '.' + String(magnitude % 100).padStart(2, '0');
}

export function money(cents) {
  const value = Number.isSafeInteger(cents) ? cents : 0;
  const magnitude = Math.abs(value);
  const integer = new Intl.NumberFormat('zh-CN').format(Math.floor(magnitude / 100));
  return (value < 0 ? '−' : '') + '¥' + integer + '.' + String(magnitude % 100).padStart(2, '0');
}

function finButton(label, action, { key, style = 'button button-outline', disabled = false } = {}) {
  return `<button type="button" class="${style}" data-fin-action="${action}"${key == null ? '' : ` data-key="${h(key)}"`}${disabled ? ' disabled' : ''}>${h(label)}</button>`;
}

function options(values, selected) {
  return Object.entries(values).map(([value, text]) => `<option value="${h(value)}"${value === selected ? ' selected' : ''}>${h(text)}</option>`).join('');
}

function textField(name, label, { value = '', type = 'text', required = false, max = 60, decimalInput = false, describedBy = '' } = {}) {
  return `<label class="field"><span>${h(label)}</span><input autocomplete="off" name="${h(name)}" type="${type}" value="${h(value)}"
    ${required ? 'required' : ''}${decimalInput ? ' inputmode="decimal"' : ''}${type === 'text' ? ` maxlength="${max}"` : ''}${describedBy ? ` aria-describedby="${h(describedBy)}"` : ''}></label>`;
}

function textarea(name, label, required = false) {
  return `<label class="field"><span>${h(label)}</span><textarea name="${h(name)}" rows="3" maxlength="300"${required ? ' required' : ''}></textarea></label>`;
}

export function pager(data, action, label) {
  if (!data?.total) return '';
  const { page, pageSize, total, hasMore } = data;
  return `<nav class="fin-page" aria-label="${h(label)}分页">
    <span>共 ${h(total)} 条 · 第 ${h(page)} / ${h(Math.ceil(total / pageSize))} 页</span>
    ${total > pageSize ? `<div>${finButton('上一页', action, { key: page - 1, disabled: page <= 1 })}
      ${finButton('下一页', action, { key: page + 1, disabled: !hasMore })}</div>` : ''}
  </nav>`;
}

export function feedback({ loading, error, loaded }, empty, retryAction) {
  if (loading) return '<p class="fin-empty" role="status">正在加载…</p>';
  if (error) return `<div class="fin-empty" role="status"><p>${h(error)}</p>${finButton('重试', retryAction)}</div>`;
  if (loaded) return `<p class="fin-empty">${h(empty)}</p>`;
  return '';
}

function stageDates(stage) {
  if (stage.startDate && stage.endDate) return `${h(stage.startDate)} 至 ${h(stage.endDate)}`;
  if (stage.startDate) return `${h(stage.startDate)} 起`;
  if (stage.endDate) return `截至 ${h(stage.endDate)}`;
  return '';
}

export function stageList(data, activeId) {
  if (!data.data?.items.length || data.loading || data.error) {
    return feedback(data, '暂无收费阶段', 'reload-stages');
  }
  return `<div class="fin-stage-list">${data.data.items.map(stage => {
    const dates = stageDates(stage);
    return `<button type="button" data-fin-action="select-stage" data-key="${h(stage.id)}"
      class="fin-stage"${activeId === stage.id ? ' aria-current="true"' : ''}>
      <span class="fin-stage-name">${h(stage.name)}</span>
      ${dates ? `<small>${dates}</small>` : ''}
    </button>`;
  }).join('')}</div>${pager(data.data, 'stage-page', '收费阶段')}`;
}

function statusName(status) {
  return billStatuses[status] || '—';
}

function statusBadge(status) {
  const classes = { unpaid: ' fin-chip--unpaid', partial: ' fin-chip--partial', paid: ' fin-chip--paid' };
  return `<span class="fin-chip${classes[status] || ''}">${statusName(status)}</span>`;
}

function billStatus(bill) {
  return bill.removed ? '<span class="fin-chip">已移除</span>' : statusBadge(bill.status);
}

function metric(label, value, extra = '') {
  return `<div><dt>${h(label)}</dt><dd>${h(value)}</dd>${extra ? `<small>${h(extra)}</small>` : ''}</div>`;
}

function billTable(items, { history = false } = {}) {
  const identity = history ? '收费阶段' : '学生';
  return `<div class="table-wrap fin-table-wrap"><table class="records-table fin-table">
    <thead><tr><th scope="col">${identity}</th><th scope="col">应收</th><th scope="col">净实收</th><th scope="col">欠款</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
    <tbody>${items.map(bill => `<tr>
      <td data-label="${identity}"><div><strong>${h(history ? bill.stageName : bill.studentName)}</strong>
        ${!history && (bill.school || bill.grade) ? `<small>${[bill.school, bill.grade].filter(Boolean).map(h).join(' · ')}</small>` : ''}</div></td>
      <td data-label="应收"><span class="fin-table-money">${money(bill.due)}</span></td>
      <td data-label="净实收"><span class="fin-table-money">${money(bill.net)}</span></td>
      <td data-label="欠款"><span class="fin-table-money">${money(bill.balance)}</span></td>
      <td data-label="状态">${billStatus(bill)}</td>
      <td data-label="操作"><div class="fin-row-actions">${finButton('查看账单', 'open-bill', { key: bill.id, style: 'text-button' })}
        ${history ? '' : finButton('缴费记录', 'open-student', { key: bill.studentId, style: 'text-button' })}
        ${history || bill.removed ? '' : finButton('移除学生', 'remove-bill', { key: bill.id, style: 'text-button fin-text-danger' })}</div></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

export function stageBoard(requestState, stage, filters) {
  const { loading, error, data, loaded } = requestState;
  if (!stage) return '<div class="records fin-empty fin-empty-stage">选择或创建一个收费阶段，开始管理学生账单。</div>';
  const totals = data?.totals;
  return `<div class="fin-stage-head"><div><h2>阶段账单</h2></div>
    <div class="fin-actions">${finButton(filters.exporting ? '正在导出…' : '导出Excel表格', 'export-stage', { disabled: filters.exporting })}
      ${finButton('批量建账', 'create-batch', { style: 'button button-primary' })}</div></div>
    ${totals ? `<dl class="fin-metrics">
      ${metric('账单人数', (totals.count ?? 0) + ' 人')}
      ${metric('应收金额', money(totals.due))}
      ${metric('净实收', money(totals.net), `收款 ${money(totals.paid)} · 退款 ${money(totals.refunded)}`)}
      ${metric('欠款金额', money(totals.balance))}
    </dl>` : ''}
    <section class="records fin-bills" aria-label="阶段账单">
      <form data-fin-form="bill-search" class="fin-search">
        <label class="field"><span class="sr-only">搜索账单学生</span><input type="search" name="search" placeholder="搜索学生姓名" value="${h(filters.search)}"></label>
        <label class="field"><span class="sr-only">收款状态</span><select name="status">${options({ '': '全部状态', ...billStatuses }, filters.status)}</select></label>
        <button type="submit" class="button button-outline">查询</button>
      </form>
      ${loading || error || !data?.items.length
        ? feedback({ loading, error, loaded }, filters.search || filters.status ? '没有符合条件的账单' : '本阶段还没有学生账单', 'reload-bills')
        : billTable(data.items) + pager(data, 'bill-page', '阶段账单')}
    </section>`;
}

function heading(title, sub) {
  return `<header class="fin-dialog-head"><div><h2>${h(title)}</h2>${sub ? `<p>${h(sub)}</p>` : ''}</div>
    <button type="button" class="editor-close" aria-label="关闭" data-fin-action="close">×</button></header>`;
}

function footer(label, back = '', { disabled = false, danger = false } = {}) {
  return `<footer class="fin-dialog-foot"><p class="form-error" data-fin-error role="alert" hidden></p>
    <div class="fin-actions">${finButton(back || '取消', back ? 'back' : 'close')}
      <button type="submit" class="button ${danger ? 'button-danger' : 'button-primary'}" data-fin-submit${disabled ? ' disabled' : ''}>${h(label)}</button></div></footer>`;
}

function dialogForm(type, title, contents, label, { sub = '', back = '', disabled = false, danger = false } = {}) {
  return `${heading(title, sub)}<form data-fin-form="${type}" class="fin-dialog-form">
    <div class="fin-dialog-body">${contents}</div>${footer(label, back, { disabled, danger })}</form>`;
}

function stageFields(dateErrorId, stage = {}) {
  return `${textField('name', '阶段名称', { value: stage.name, required: true })}
    ${textField('startDate', '开始日期（选填）', { value: stage.startDate, type: 'date', describedBy: dateErrorId })}
    ${textField('endDate', '结束日期（选填）', { value: stage.endDate, type: 'date', describedBy: dateErrorId })}
    ${textField('referenceAmount', '参考价（元，选填）', { value: decimal(stage.referenceAmount), decimalInput: true })}`;
}

export function renderStageSettings(stage) {
  return `<form class="records fin-stage-settings" data-fin-form="stage-update" data-stage-id="${h(stage.id)}" aria-labelledby="fin-stage-title">
    <h2 id="fin-stage-title">${h(stage.name)}</h2>
    <div class="fin-stage-fields">${stageFields('fin-stage-settings-date-error', stage)}</div>
    <p class="form-error" id="fin-stage-settings-date-error" data-fin-stage-date-error aria-live="polite" hidden></p>
    <p class="form-error" data-fin-stage-error role="alert" hidden></p>
    <div class="fin-actions"><button class="button button-outline" type="submit">保存修改</button></div>
  </form>`;
}

export function renderStageForm() {
  return dialogForm('stage', '创建收费阶段', `${stageFields('fin-stage-create-date-error')}
    <p class="form-error" id="fin-stage-create-date-error" data-fin-stage-date-error aria-live="polite" hidden></p>`, '创建阶段');
}

export function renderRemoveBill({ bill, parent }) {
  const restriction = bill.net !== 0;
  const explanation = restriction
    ? `当前净实收为 ${money(bill.net)}，请先退款或冲正，将净实收调整为零后再移除。`
    : '账单将从本阶段台账移除。历史账单和流水仍可在学生缴费记录中查看，之后也可重新建账。';
  return dialogForm('remove-bill', '移除学生', `<p>从「${h(bill.stageName)}」移除 ${h(bill.studentName)} 的账单。</p>
    <p class="fin-subdued">${explanation}</p>`, '确认移除', { disabled: restriction, back: parent ? '返回流水' : '', danger: true });
}

export function renderCandidatePage(operation) {
  const { data, loading, error } = operation.results;
  if (loading || error || !data?.items.length) return feedback(operation.results, '没有可建账的学生', 'reload-candidates');
  return `<div class="fin-candidate-list">${data.items.map(student => `<label class="choice-row">
    <input type="checkbox" name="candidate" value="${h(student.id)}"${operation.students.has(student.id) ? ' checked' : ''}>
    <span><strong>${h(student.name)}</strong>${student.school || student.grade ? `<small>${[student.school, student.grade].filter(Boolean).map(h).join(' · ')}</small>` : ''}</span></label>`).join('')}</div>
    ${pager(data, 'candidate-page', '可建账学生')}`;
}

export function renderBatchSelection(students) {
  if (!students.size) return '<p class="fin-subdued">请选择要建账的学生。</p>';
  return `<ul class="fin-draft-list">${[...students].map(([id, item]) => `<li><span>${h(item.student.name)}</span>
    <input class="fin-amount" type="text" inputmode="decimal" maxlength="18" data-fin-due="${h(id)}" aria-label="${h(item.student.name)}的应收金额（元）"
      value="${h(item.amount)}" placeholder="金额（元）">
    ${finButton('移除', 'remove-candidate', { key: id, style: 'text-button' })}</li>`).join('')}</ul>`;
}

export function renderBatchForm(operation) {
  return `${heading('批量建账', operation.stage.name)}<div class="fin-dialog-scroll">
    <form data-fin-form="candidate-search" class="fin-search fin-candidate-search">
      <label class="field"><span class="sr-only">搜索学生</span><input type="search" name="search" placeholder="搜索学生姓名" value="${h(operation.search)}"></label>
      <button type="submit" class="button button-outline">查询</button>
    </form>
    <div class="fin-selection-tools" role="group" aria-label="批量选择建账学生">
      ${finButton('全选本页', 'select-candidate-page', { style: 'text-button', disabled: true })}
      ${finButton('取消全选', 'clear-candidates', { style: 'text-button', disabled: true })}
    </div>
    <div data-fin-candidates>${renderCandidatePage(operation)}</div>
    <div class="fin-draft"><h3>已选学生 <span data-fin-selected-count aria-live="polite">${operation.students.size}</span></h3>
    <div data-fin-draft>${renderBatchSelection(operation.students)}</div></div>
  </div><form data-fin-form="batch">${footer('创建账单')}</form>`;
}

function eventPhotos(event) {
  return (event.photos || []).filter(photo => photo.url?.startsWith('/admin-api/')).map((photo, index) => `<button type="button" class="fin-proof" data-fin-action="proof" data-key="${h(photo.url)}" aria-label="查看第 ${index + 1} 张凭证">
    <img src="${h(photo.url)}" loading="lazy" alt="收退款凭证"></button>`).join('');
}

export function renderDraftProofs(photos = []) {
  return photos.map((photo, index) => `<div class="fin-draft-proof">
    <button type="button" class="fin-proof" data-fin-action="draft-proof" data-key="${index}" aria-label="预览第 ${index + 1} 张凭证">
      <img src="${h(photo.url)}" alt="">
    </button>
    <button type="button" class="fin-proof-remove" data-fin-action="remove-proof" data-key="${index}" aria-label="移除第 ${index + 1} 张凭证">×</button>
  </div>`).join('');
}

function eventRows(items, readOnly) {
  return `<ol class="fin-events">${items.map(item => {
    const isFinancial = item.type === 'payment' || item.type === 'refund';
    const photos = eventPhotos(item);
    const reversal = item.type === 'reversal';
    const label = reversal && (item.targetType === 'payment' || item.targetType === 'refund')
      ? '冲正' + eventTypes[item.targetType] : eventTypes[item.type] || '账单记录';
    const occurrence = item.date && `${eventTypes[item.type] || '操作'}日期 ${item.date}`;
    const actor = item.username && `登记人 ${item.username}`;
    const meta = [occurrence, paymentMethods[item.method], actor].filter(Boolean).map(h).join(' · ');
    const debit = item.type === 'refund' || (reversal && item.targetType === 'payment');
    const amount = Number.isSafeInteger(item.amount) ? money(debit ? -Math.abs(item.amount) : item.amount) : '';
    const previousDue = item.beforeDue ?? item.previousDue;
    const newDue = item.afterDue ?? item.newDue;
    const discount = Number.isSafeInteger(item.discount) ? Math.abs(item.discount) : 0;
    const dueAdjusted = (item.type === 'adjustment' || discount > 0) && Number.isSafeInteger(previousDue) && Number.isSafeInteger(newDue);
    const reversed = item.reversed || item.reversedBy;
    return `<li><div class="fin-event-top"><strong>${h(label)}</strong>
      ${amount ? `<span>${reversal && item.targetType === 'refund' ? '+' : ''}${amount}</span>` : ''}
      ${reversed ? '<span class="fin-chip">已冲正</span>' : ''}
      ${isFinancial && !reversed && !readOnly ? finButton('冲正', 'reversal', { key: item.id, style: 'text-button' }) : ''}</div>
      ${meta ? `<p class="fin-subdued">${meta}</p>` : ''}
      ${discount > 0 ? `<p class="fin-discount">${reversal ? '撤销优惠' : '优惠'} ${money(discount)}</p>` : ''}
      ${dueAdjusted ? `<p>应收金额 ${money(previousDue)} → ${money(newDue)}</p>` : ''}
      ${item.note ? `<p class="fin-note">${h(item.note)}</p>` : ''}
      ${photos ? `<div class="fin-proofs">${photos}</div>` : ''}</li>`;
  }).join('')}</ol>`;
}

function recordBody(operation, empty, retry, rows) {
  if (operation.results.loading || operation.results.error || !operation.results.data?.items.length) {
    return feedback(operation.results, empty, retry);
  }
  return rows(operation.results.data.items);
}

export function renderBill(operation) {
  const bill = operation.results.data?.bill;
  const title = bill?.studentName ? bill.studentName + '的账单' : '账单流水';
  const removed = bill?.removed === true;
  return `${heading(title, bill?.stageName || '')}<div class="fin-dialog-scroll">
    ${operation.parent ? '<div class="fin-actions fin-return">' + finButton('返回缴费记录', 'back') + '</div>' : ''}
    ${bill ? `<dl class="fin-metrics fin-metrics--compact">${metric('应收', money(bill.due))}
      ${metric('净实收', money(bill.net))}${metric('欠款', money(bill.balance))}</dl>
      <div class="fin-bill-actions">${billStatus(bill)}
      ${removed ? '' : `<div class="fin-actions">${finButton('移除学生', 'remove-bill', { key: bill.id, style: 'button button-outline fin-text-danger' })}
        ${finButton('调整应收', 'edit-due')}${finButton('登记退款', 'refund')}
        ${finButton('登记收款', 'payment', { style: 'button button-primary', disabled: bill.balance <= 0 })}</div>`}</div>` : ''}
    ${recordBody(operation, '暂无流水', 'reload-dialog', items => eventRows(items, removed))}
    ${pager(operation.results.data, 'dialog-page', '账单流水')}
  </div>`;
}

export function renderHistory(operation) {
  const student = operation.results.data?.student;
  return `${heading(student ? student.name + '的缴费记录' : '学生缴费记录', student && [student.school, student.grade].filter(Boolean).join(' · '))}
    <div class="fin-dialog-scroll">${recordBody(operation, '该学生还没有账单', 'reload-dialog', items => billTable(items, { history: true }))}
      ${pager(operation.results.data, 'dialog-page', '学生账单')}</div>`;
}

export function renderDueForm(operation) {
  return dialogForm('due', '调整应收', `${textField('due', '新应收金额（元）', { value: decimal(operation.bill.due), required: true, decimalInput: true })}
    ${textarea('note', '调整原因', true)}`, '保存调整', { sub: operation.bill.studentName, back: '返回流水' });
}

export function paymentOutcome(balance, amount, fullPayment) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return `当前待收 ${money(balance)}，请输入有效的收款金额。`;
  if (amount > balance) return `收款金额不能超过当前待收 ${money(balance)}。`;
  const remaining = balance - amount;
  if (!remaining) return `实收 ${money(amount)}，账单将结清。`;
  return fullPayment
    ? `实收 ${money(amount)}，优惠 ${money(remaining)}，账单将结清。`
    : `实收 ${money(amount)}，仍待收 ${money(remaining)}。`;
}

export function renderEventForm(operation, day) {
  const { type, target, bill } = operation;
  const label = type === 'reversal' ? '确认冲正' : '登记' + eventTypes[type];
  const payment = type === 'payment';
  const reversal = type === 'reversal';
  const contents = reversal ? `<p>将冲正这笔${h(eventTypes[target.type])} ${money(target.amount)}，账单余额会随流水更新。${target.discount > 0 ? `同时撤销优惠 ${money(target.discount)}。` : ''}</p>
    ${textField('date', '冲正日期', { type: 'date', value: day, required: true })}${textarea('note', '冲正原因', true)}` :
    `${textField('amount', `${eventTypes[type]}金额（元）`, { value: payment ? decimal(bill.balance) : '', required: true, decimalInput: true,
      describedBy: payment ? 'fin-payment-summary' : '' })}
      ${payment ? `<div class="fin-payment-options">
        <label class="choice-row"><input type="checkbox" name="fullPayment" value="true" checked aria-describedby="fin-payment-summary">
          <span>全部收款</span></label>
        <p id="fin-payment-summary" data-fin-payment-summary role="status">${h(paymentOutcome(bill.balance, bill.balance, true))}</p>
      </div>` : ''}
      <div class="form-grid">${textField('date', `${eventTypes[type]}日期`, { value: day, required: true, type: 'date' })}
        <label class="field"><span>${eventTypes[type]}方式</span><select name="method">${options(paymentMethods, 'wechat')}</select></label>
      </div>
      <div class="fin-proof-picker">
        <div class="fin-proof-picker-heading">
          <strong>付款凭证（选填）</strong>
          <label class="fin-proof-trigger">
            <input name="photo" type="file" class="sr-only" accept="image/*" multiple aria-label="付款凭证（选填）" aria-describedby="fin-photo-help">
            <span class="button button-outline" aria-hidden="true">选择图片</span>
          </label>
        </div>
        <p id="fin-photo-help" class="fin-subdued">最多上传 ${financeProofLimit} 张图片，单张不超过 2 MiB。</p>
        <p class="fin-proof-status fin-subdued" data-fin-proof-count role="status">已选 ${operation.photos?.length || 0} / ${financeProofLimit} 张</p>
        <p class="form-error" data-fin-proof-error role="alert" hidden></p>
        <div class="fin-proofs fin-draft-proofs" data-fin-draft-proofs>${renderDraftProofs(operation.photos)}</div>
      </div>
      ${textarea('note', '备注（选填）')}`;
  return dialogForm('event', label, contents, label, { sub: bill.studentName, back: '返回流水' });
}
