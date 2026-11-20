import './finance-overview.css';
import { request } from './api.js';
import { downloadFinanceWorkbook } from './finance-overview-export.js';
import { money } from './finance-views.js';
import { escapeHtml as h } from './views.js';

const PAGE_SIZE = 8;
const METRICS = [
  ['count', '账单数'], ['due', '应收'], ['paid', '收款'],
  ['refunded', '退款'], ['net', '净实收'], ['balance', '未收'],
];
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });

function sortItems(items) {
  const timelineDate = (stage) => stage.startDate || stage.endDate
    || (Number.isFinite(stage.createdAt) ? new Date(stage.createdAt).toISOString().slice(0, 10) : '');
  return [...items].sort((a, b) => timelineDate(a.stage).localeCompare(timelineDate(b.stage))
    || (a.stage.createdAt || 0) - (b.stage.createdAt || 0) || a.stage.id.localeCompare(b.stage.id));
}

function monthSpan({ startDate, endDate }) {
  return [startDate, endDate].filter(Boolean).join(' 至 ');
}

function share(part, whole) {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

function percentLabel(ratio) {
  if (ratio > 0 && ratio < 0.001) return '<0.1%';
  if (ratio < 1 && ratio > 0.999) return '>99.9%';
  return percent.format(ratio);
}

function bar(key, part, whole, size = 'width') {
  return `<span class="fin-ov-bar-${key}" style="${size}:${share(part, whole) * 100}%"></span>`;
}

function columns(items, scaleTop, scaleStart, label, render) {
  return `<div class="fin-ov-column-scroll" role="region" aria-label="${h(label)}，可横向滚动" tabindex="0">
    <div class="fin-ov-column-chart" style="--column-count:${items.length}">
      <div class="fin-ov-column-axis" aria-hidden="true"><span>${h(scaleTop)}</span><span>${h(scaleStart)}</span></div>
      <ol class="fin-ov-column-rows">${items.map(render).join('')}</ol>
    </div>
  </div>`;
}

function columnPlot(value, part, whole, bars) {
  return `<div class="fin-ov-column-plot" style="--column-share:${share(part, whole) * 100}%">
    <span class="fin-ov-column-value">${h(value)}</span>
    <div class="fin-ov-column-fill" aria-hidden="true">${bars}</div>
  </div>`;
}

function amountComparison(items) {
  const ceiling = items.reduce((max, { totals }) => Math.max(max, totals.due), 0);
  const priority = items.reduce((largest, item) => item.totals.balance > largest.totals.balance ? item : largest);
  return `<section class="fin-ov-panel fin-ov-amount" aria-labelledby="fin-ov-amount-title">
    <div class="fin-ov-chart-heading"><h3 id="fin-ov-amount-title">应收构成</h3><span>按阶段时间排列</span></div>
    ${ceiling ? `<ul class="fin-ov-legend" aria-label="应收构成图例">
      <li><i class="fin-ov-swatch-net" aria-hidden="true"></i>净实收</li>
      <li><i class="fin-ov-swatch-balance" aria-hidden="true"></i>未收</li>
    </ul>
    ${priority.totals.balance > 0 ? `<p class="fin-ov-priority"><span>未收最多</span>
      <strong>${h(priority.stage.name)}</strong><b>${money(priority.totals.balance)}</b></p>` : ''}
    ${columns(items, money(ceiling), '¥0', '各阶段应收及未收对比', ({ stage, totals }) => `<li class="fin-ov-amount-row">
      ${columnPlot(totals.due ? money(totals.due) : '无应收', totals.due, ceiling,
        bar('net', totals.net, totals.due, 'height') + bar('balance', totals.balance, totals.due, 'height'))}
      <strong class="fin-ov-column-name">${h(stage.name)}</strong>
      ${totals.due ? `<div class="fin-ov-column-breakdown"><span>净实收 ${money(totals.net)}</span><span>未收 ${money(totals.balance)}</span></div>` : ''}
    </li>`)}` : '<p class="fin-ov-message">所选阶段暂无应收金额。</p>'}
  </section>`;
}

function collectionComparison(totals, items) {
  const overall = share(totals.net, totals.due);
  const rows = [...items].sort((a, b) => {
    const rate = ({ totals }) => totals.due ? share(totals.net, totals.due) : Infinity;
    return rate(a) - rate(b) || b.totals.due - a.totals.due;
  });
  return `<section class="fin-ov-panel fin-ov-rates" aria-labelledby="fin-ov-rate-title">
    <div class="fin-ov-chart-heading"><h3 id="fin-ov-rate-title">收款率对比</h3><span>净实收 ÷ 应收</span></div>
    <div class="fin-ov-rate-body">
      <div class="fin-ov-rate-summary">
        <div class="fin-ov-ring${totals.due ? '' : ' fin-ov-ring--empty'}" style="--collected:${overall * 100}%">
          <strong class="fin-ov-ring-value">${totals.due ? h(percentLabel(overall)) : '—'}</strong>
          <span>整体收款率</span>
        </div>
      </div>
      <ol class="fin-ov-chart-rows fin-ov-rate-rows" aria-label="各阶段收款率，从低到高"${rows.length > 6 ? ' tabindex="0"' : ''}>
        ${rows.map(({ stage, totals: row }) => `<li class="fin-ov-rate-row">
          <div class="fin-ov-chart-row-head"><strong>${h(stage.name)}</strong>
            <span>${row.due ? h(percentLabel(share(row.net, row.due))) : '无应收'}</span></div>
          ${row.due ? `<div class="fin-ov-bar fin-ov-bar-small" aria-hidden="true">${bar('rate', row.net, row.due)}</div>` : ''}
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

function studentComparison(items) {
  const ceiling = items.reduce((max, { totals }) => Math.max(max, totals.count), 1);
  return `<section class="fin-ov-panel fin-ov-counts" aria-labelledby="fin-ov-count-title">
    <div class="fin-ov-chart-heading"><h3 id="fin-ov-count-title">各期人数对比</h3><span>按本阶段建账学生统计</span></div>
    ${columns(items, `${ceiling} 人`, '0 人', '各阶段建账人数', ({ stage, totals }) => `<li class="fin-ov-count-row">
      ${columnPlot(`${totals.count} 人`, totals.count, ceiling, bar('count', 1, 1, 'height'))}
      <strong class="fin-ov-column-name">${h(stage.name)}</strong>
    </li>`)}
  </section>`;
}

function refundComparison(items) {
  const rows = items.filter(({ totals }) => totals.refunded > 0).sort((a, b) => b.totals.refunded - a.totals.refunded);
  if (!rows.length) return '';
  const ceiling = rows[0].totals.refunded;
  return `<section class="fin-ov-panel fin-ov-refunds" aria-labelledby="fin-ov-refund-title">
    <div class="fin-ov-chart-heading"><h3 id="fin-ov-refund-title">退款分布</h3><span>按退款金额排序</span></div>
    <ol class="fin-ov-chart-rows" aria-label="有退款的收费阶段"${rows.length > 6 ? ' tabindex="0"' : ''}>
      ${rows.map(({ stage, totals }) => `<li class="fin-ov-refund-row">
        <div class="fin-ov-chart-row-head"><strong>${h(stage.name)}</strong><span>退款 ${money(totals.refunded)}</span></div>
        <div class="fin-ov-bar fin-ov-bar-small" aria-hidden="true">${bar('refund', totals.refunded, ceiling)}</div>
        <div class="fin-ov-bar-labels"><span>占本期收款 ${h(percentLabel(share(totals.refunded, totals.paid)))}</span></div>
      </li>`).join('')}
    </ol>
  </section>`;
}

function stagePager(page) {
  if (!page || page.total <= page.pageSize) return '';
  return `<nav class="fin-ov-pager" aria-label="选择收费阶段分页">
    <span>第 ${h(page.page)} / ${h(Math.ceil(page.total / page.pageSize))} 页</span>
    <button type="button" data-ov-action="page" data-page="${page.page - 1}" aria-label="选择收费阶段上一页"${page.page === 1 ? ' disabled' : ''}>‹</button>
    <button type="button" data-ov-action="page" data-page="${page.page + 1}" aria-label="选择收费阶段下一页"${page.hasMore ? '' : ' disabled'}>›</button>
  </nav>`;
}

function stagesBody(scope) {
  if (scope.stagesLoading) return '<p class="fin-ov-message" role="status">正在加载收费阶段…</p>';
  if (scope.stageError) return `<div class="fin-ov-message"><p role="alert">${h(scope.stageError)}</p>
    <button type="button" class="text-button" data-ov-action="retry-stages">重试</button></div>`;
  if (!scope.stages?.items.length) return '<p class="fin-ov-message">没有符合条件的收费阶段。</p>';
  return `<div class="fin-ov-list">${scope.stages.items.map(stage => `<label>
    <input type="checkbox" data-ov-stage="${h(stage.id)}"${scope.selected.has(stage.id) ? ' checked' : ''}>
    <span><strong>${h(stage.name)}</strong>${monthSpan(stage) ? `<small>${h(monthSpan(stage))}</small>` : ''}</span>
  </label>`).join('')}</div>${stagePager(scope.stages)}`;
}

function detailCells(totals, combined = false) {
  const currency = METRICS.slice(1).map(([key]) => {
    const className = key === 'net' || (key === 'balance' && totals.balance > 0) ? ` class="fin-ov-value-${key}"` : '';
    return `<td${className}>${money(totals[key])}</td>`;
  }).join('');
  const rate = totals.due ? percentLabel(share(totals.net, totals.due)) : '—';
  return `<td>${h(totals.count)} ${combined ? '人次' : '人'}</td>${currency}<td>${h(rate)}</td>`;
}

function stageDetails(items, totals) {
  return `<section class="fin-ov-detail-table" aria-labelledby="fin-ov-table-title">
    <h3 id="fin-ov-table-title">阶段明细</h3>
    <div class="fin-ov-table" role="region" aria-label="各收费阶段明细，可横向滚动" tabindex="0">
      <table>
        <colgroup span="1"></colgroup><colgroup span="1"></colgroup><colgroup span="5"></colgroup><colgroup span="1"></colgroup>
        <thead><tr>
          <th class="fin-ov-period-column" scope="col" rowspan="2">收费阶段</th>
          <th scope="col" rowspan="2">建账人数</th><th class="fin-ov-amount-group" scope="colgroup" colspan="5">金额（元）</th>
          <th scope="col" rowspan="2">收款率</th>
        </tr><tr>${METRICS.slice(1).map(([, label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
        <tbody>${items.map(({ stage, totals: stageTotals }) => `<tr><th class="fin-ov-period-column" scope="row">${h(stage.name)}
          ${monthSpan(stage) ? `<small>${h(monthSpan(stage))}</small>` : ''}</th>${detailCells(stageTotals)}</tr>`).join('')}</tbody>
        <tfoot><tr><th class="fin-ov-period-column" scope="row">合计</th>${detailCells(totals, true)}</tr></tfoot>
      </table>
    </div>
  </section>`;
}

function resultsBody(scope) {
  if (!scope.selected.size) return '<p class="fin-ov-message">勾选一个或多个收费阶段即可查看汇总与对比。</p>';
  if (scope.overviewLoading) return '<p class="fin-ov-message" role="status">正在计算所选阶段金额…</p>';
  if (scope.overviewError) return `<div class="fin-ov-message"><p role="alert">${h(scope.overviewError)}</p>
    <button type="button" class="text-button" data-ov-action="retry-overview">重试</button></div>`;
  if (!scope.overview?.items.length) return '<p class="fin-ov-message">暂无阶段统计。</p>';
  const { totals, items } = scope.overview;
  return `<dl class="fin-ov-metrics" aria-label="所选阶段统计">${METRICS.map(([key, label]) =>
    `<div><dt>${label}${key === 'count' ? '（人次）' : '金额'}</dt><dd>${key === 'count' ? h(totals.count) : h(money(totals[key]))}</dd></div>`).join('')}</dl>
    <div class="fin-ov-charts">
      ${amountComparison(items)}
      ${studentComparison(items)}
      ${collectionComparison(totals, items)}
      ${refundComparison(items)}
    </div>
    ${stageDetails(items, totals)}`;
}

function canExport(scope) {
  return scope.selected.size && scope.overview?.items.length && !scope.overviewLoading && !scope.overviewError && !scope.exporting;
}

export function createFinanceOverview({ root, handleUnauthorized }) {
  root.hidden = true;
  root.classList.add('fin-overview');
  root.innerHTML = `<section aria-labelledby="fin-overview-title">
    <header class="fin-ov-head"><h2 id="fin-overview-title">财务总览</h2>
      <div class="fin-ov-tools"><span class="fin-ov-count" data-ov-count aria-live="polite"></span>
        <button type="button" class="button button-outline" data-ov-action="export" disabled>导出Excel表格</button>
      </div>
    </header>
    <p class="form-error fin-ov-export-error" data-ov-export-error role="alert" hidden></p>
    <div class="fin-ov-layout">
      <section class="fin-ov-picker" aria-label="选择收费阶段">
        <form class="fin-ov-search">
          <label class="field"><span class="sr-only">搜索收费阶段</span><input type="search" name="search" placeholder="搜索收费阶段" maxlength="80"></label>
          <button type="submit" class="button button-outline">查询</button>
        </form>
        <div class="fin-selection-tools" role="group" aria-label="批量选择收费阶段">
          <button type="button" class="text-button" data-ov-action="select-page" disabled>全选本页</button>
          <button type="button" class="text-button" data-ov-action="clear-selection" disabled>取消全选</button>
        </div>
        <div data-ov-stages></div>
      </section>
      <div class="fin-ov-detail"><div data-ov-results aria-live="polite"></div></div>
    </div>
  </section>`;
  const list = root.querySelector('[data-ov-stages]');
  const results = root.querySelector('[data-ov-results]');
  const counter = root.querySelector('[data-ov-count]');
  const exportButton = root.querySelector('[data-ov-action="export"]');
  const selectPageButton = root.querySelector('[data-ov-action="select-page"]');
  const clearSelectionButton = root.querySelector('[data-ov-action="clear-selection"]');
  const exportError = root.querySelector('[data-ov-export-error]');
  const searchInput = root.querySelector('input[name="search"]');
  let workspace;
  let active = false;

  function syncSelectionActions(scope) {
    selectPageButton.disabled = scope.stagesLoading || Boolean(scope.stageError)
      || !scope.stages?.items.some(stage => !scope.selected.has(stage.id));
    clearSelectionButton.disabled = scope.selected.size === 0;
  }

  function renderStages(scope) {
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset : null;
    list.innerHTML = stagesBody(scope);
    if (focused?.ovStage) [...list.querySelectorAll('[data-ov-stage]')]
      .find(input => input.dataset.ovStage === focused.ovStage)?.focus({ preventScroll: true });
    syncSelectionActions(scope);
  }

  function renderHeader(scope) {
    counter.textContent = '已选 ' + scope.selected.size + ' 期';
    syncSelectionActions(scope);
    exportButton.disabled = !canExport(scope);
    exportButton.textContent = scope.exporting ? '正在导出…' : '导出Excel表格';
    exportError.textContent = scope.exportError || '';
    exportError.hidden = !scope.exportError;
  }

  function renderResults(scope) {
    results.innerHTML = resultsBody(scope);
    renderHeader(scope);
  }

  async function exportOverview(scope) {
    if (!canExport(scope)) return;
    const { overviewSequence, organizationName } = scope;
    const stageIds = [...scope.selected];
    scope.exporting = true;
    scope.exportError = '';
    renderHeader(scope);
    try {
      const workbook = await request(scope.base + '/overview/workbook', {
        method: 'POST', body: { stageIds }, workbook: true,
      });
      if (!active || workspace !== scope) return;
      if (scope.overviewSequence !== overviewSequence) {
        scope.exportError = '统计已更新，请重新导出。';
        return;
      }
      downloadFinanceWorkbook(workbook, [organizationName, '财务总览']);
    } catch (error) {
      if (active && workspace === scope && !handleUnauthorized(error)) {
        scope.exportError = error.message || '导出财务总览失败，请重试。';
      }
    } finally {
      scope.exporting = false;
      if (active && workspace === scope) renderHeader(scope);
    }
  }

  async function updateOverview(scope) {
    const sequence = ++scope.overviewSequence;
    scope.overviewError = '';
    scope.exportError = '';
    const stageIds = [...scope.selected];
    scope.overviewLoading = stageIds.length > 0;
    renderResults(scope);
    if (!stageIds.length) return;
    const current = () => active && workspace === scope && sequence === scope.overviewSequence;
    try {
      const data = await request(scope.base + '/overview', { method: 'POST', body: { stageIds } });
      if (!current()) return;
      if (!Array.isArray(data.items) || !data.totals) throw new Error('汇总返回格式异常，请重试。');
      scope.overview = { totals: data.totals, items: sortItems(data.items) };
    } catch (error) {
      if (current() && !handleUnauthorized(error)) scope.overviewError = error.message;
    } finally {
      if (current()) {
        scope.overviewLoading = false;
        renderResults(scope);
      }
    }
  }

  async function loadStages(scope, page = 1) {
    const sequence = ++scope.stagesSequence;
    scope.stagesLoading = true;
    scope.stageError = '';
    renderStages(scope);
    const current = () => active && workspace === scope && sequence === scope.stagesSequence;
    try {
      const data = await request(scope.base + '/stages?' + new URLSearchParams({ search: scope.search, page, pageSize: PAGE_SIZE }));
      if (!current()) return;
      if (!Array.isArray(data.items) || !Number.isInteger(data.page)) throw new Error('收费阶段返回格式异常，请重试。');
      scope.stages = data;
      if (!scope.initialized && data.items.length) {
        scope.initialized = true;
        const recent = data.items[0];
        scope.selected.add(recent.id);
        void updateOverview(scope);
      }
    } catch (error) {
      if (current() && !handleUnauthorized(error)) scope.stageError = error.message;
    } finally {
      if (current()) {
        scope.stagesLoading = false;
        renderStages(scope);
      }
    }
  }

  root.addEventListener('submit', event => {
    if (!active || !event.target.matches('.fin-ov-search')) return;
    event.preventDefault();
    workspace.search = searchInput.value.trim();
    void loadStages(workspace);
  });

  root.addEventListener('change', event => {
    if (!active || !event.target.matches('input[data-ov-stage]')) return;
    const id = event.target.dataset.ovStage;
    const stage = workspace.stages?.items.find(item => item.id === id);
    if (!stage) return;
    if (event.target.checked) workspace.selected.add(id);
    else workspace.selected.delete(id);
    workspace.initialized = true;
    void updateOverview(workspace);
  });

  root.addEventListener('click', event => {
    if (!active) return;
    const button = event.target.closest('button[data-ov-action]');
    if (!button) return;
    const { ovAction, page } = button.dataset;
    if (ovAction === 'page' || ovAction === 'retry-stages') {
      void loadStages(workspace, Number(page) || workspace.stages?.page || 1);
      searchInput.focus({ preventScroll: true });
    } else if (ovAction === 'retry-overview') {
      void updateOverview(workspace);
    } else if (ovAction === 'select-page' || ovAction === 'clear-selection') {
      if (button.disabled) return;
      if (ovAction === 'select-page') {
        for (const stage of workspace.stages.items) workspace.selected.add(stage.id);
      } else workspace.selected.clear();
      workspace.initialized = true;
      renderStages(workspace);
      void updateOverview(workspace);
    } else if (ovAction === 'export') void exportOverview(workspace);
  });

  function hide() {
    active = false;
    root.hidden = true;
    if (workspace) {
      workspace.stagesSequence++;
      workspace.overviewSequence++;
    }
  }

  return {
    show({ organizationId, organizationName }) {
      if (!organizationId) return hide();
      if (active && workspace?.organizationId === organizationId) return;
      if (workspace?.organizationId !== organizationId) {
        workspace = {
          organizationId, base: '/organizations/' + encodeURIComponent(organizationId) + '/finance',
          selected: new Set(), initialized: false, search: '', stagesSequence: 0, overviewSequence: 0,
        };
        searchInput.value = '';
      }
      workspace.organizationName = organizationName || organizationId;
      active = true;
      root.hidden = false;
      renderHeader(workspace);
      void loadStages(workspace, workspace.stages?.page || 1);
      void updateOverview(workspace);
    },
    hide,
    refresh() {
      if (!active || !workspace) return;
      const scope = workspace;
      return Promise.all([loadStages(scope, scope.stages?.page || 1), updateOverview(scope)]);
    },
  };
}
