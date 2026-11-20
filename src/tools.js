import './tools.css';
import { request } from './api.js';
import { escapeHtml as h } from './views.js';

const MAX_CATEGORIES = 30;
const MAX_CATEGORY_TOOLS = 30;
const NAME_LENGTH = 32;
const TOOL_KEY_LENGTH = 64;
const TOOL_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const ROLES = [['parentVisible', '家长端'], ['teacherVisible', '教师端']];
const BANNER_PAGES = [
  ['tools', '实用工具列表'],
  ['profile', '我的'],
  ['work', '作业详情'],
  ['mealPost', '餐食详情'],
  ['dailyPost', '日常详情'],
  ['weeklyMenu', '每周菜谱详情'],
  ['toolDetail', '工具详情'],
];
const CATALOG_PATH = '/tools/catalog';
const ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ICON_SIZE = 512 * 1024;
const TOOL_DEFAULTS = { icon: '', iconId: '', adEnabled: false, adProbability: 0, teacherAdExempt: false };
const NEW_TOOL = { ...TOOL_DEFAULTS, name: '', key: '', parentVisible: true, teacherVisible: true };

function control(text, action, { key = '', disabled = false, style = 'button button-outline', label = '' } = {}) {
  return `<button type="button" class="${style}" data-tools-action="${action}"${key ? ` data-key="${h(key)}"` : ''}${label ? ` aria-label="${h(label)}"` : ''}${disabled ? ' disabled' : ''}>${text}</button>`;
}

function visibility(item, isTool = false) {
  return `<div class="tools-visibility" role="group" aria-label="${isTool ? '工具可见范围' : '分类可见范围'}">${ROLES.map(([key, title]) => `
    <label class="tools-visibility-choice">
      <input type="checkbox" name="${key}" data-tools-field="${key}"${item[key] ? ' checked' : ''}>
      <span>${title}显示</span>
    </label>`).join('')}</div>`;
}

function bannerSettings(banners) {
  return `<section class="tools-banner-card" aria-labelledby="tools-banners-title" aria-describedby="tools-banners-help">
    <h2 id="tools-banners-title">横幅广告管理</h2>
    <p id="tools-banners-help">按页面设置小程序横幅广告，保存后对当前机构生效。</p>
    <div class="tools-banner-pages">${BANNER_PAGES.map(([key, name]) => `
      <label class="tools-switch tools-banner-option">
        <span>${name}</span>
        <input type="checkbox" role="switch" data-tools-banner="${key}"${banners[key] ? ' checked' : ''}>
        <span class="tools-switch-track" aria-hidden="true"></span>
      </label>`).join('')}
    </div>
  </section>`;
}

function toolFields(item) {
  return `<label class="field"><span>工具名称</span>
      <input type="text" name="name" aria-required="true" aria-describedby="tools-tool-problem" maxlength="${NAME_LENGTH}"
        value="${h(item.name)}" placeholder="例如 专注计时">
    </label>
    <label class="field"><span>工具标识</span>
      <input type="text" name="key" aria-required="true" aria-describedby="tools-key-help tools-tool-problem"
        maxlength="${TOOL_KEY_LENGTH}" value="${h(item.key)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="例如 focus-timer">
    </label>`;
}

function iconUrl(path, id) {
  return id ? `/admin-api${path}/icons/${encodeURIComponent(id)}` : '';
}

function iconArtwork(url, name) {
  return `<span aria-hidden="true">${h([...name.trim()][0] || '工')}</span>${url ? `<img src="${h(url)}" alt="">` : ''}`;
}

function toolIconField() {
  return `<section class="tools-icon-field" aria-labelledby="tools-icon-label">
    <strong id="tools-icon-label">工具图标</strong>
    <div class="tools-icon-upload">
      <div class="tools-icon-preview" data-tools-icon-preview aria-hidden="true"></div>
      <div class="tools-icon-body">
        <p class="tools-icon-label" data-tools-icon-label role="status"></p>
        <p id="tools-icon-help">支持 PNG、JPG、WebP，最大 512 KB。</p>
        <div class="tools-icon-actions">
          <input type="file" data-tools-icon-input accept="${ICON_TYPES.join(',')},.png,.jpg,.jpeg,.webp" hidden>
          <button type="button" class="button button-outline" data-tools-action="choose-icon" aria-describedby="tools-icon-help"></button>
          ${control('移除图标', 'clear-icon', { style: 'text-button text-button-danger' })}
        </div>
      </div>
    </div>
    <p class="form-error" data-tools-icon-error role="alert" hidden></p>
  </section>`;
}

function toolAdControls(item) {
  return `<div class="tools-ad-settings" role="group" aria-label="激励视频设置">
    <div class="tools-ad-toggle">
      <div>
        <strong id="tools-ad-label">激励视频</strong>
        <p id="tools-ad-help">开启后按概率触发，0% 不弹出。</p>
      </div>
      <label class="tools-switch">
        <input type="checkbox" role="switch" name="adEnabled" aria-labelledby="tools-ad-label"
          aria-describedby="tools-ad-help"${item.adEnabled ? ' checked' : ''}>
        <span class="tools-switch-track" aria-hidden="true"></span>
      </label>
    </div>
    <label class="field tools-ad-probability"><span>触发概率</span>
      <span class="tools-percent-input">
        <input type="number" name="adProbability" inputmode="numeric" min="0" max="100" step="1" required
          aria-describedby="tools-ad-help tools-ad-problem"
          value="${Number.isFinite(item.adProbability) ? item.adProbability : ''}">
        <span aria-hidden="true">%</span>
      </span>
    </label>
    <p class="form-error tools-tool-error" id="tools-ad-problem" data-tools-ad-error hidden></p>
    <div class="tools-ad-toggle tools-ad-exemption">
      <div>
        <strong id="tools-ad-exemption">教师端免广告</strong>
        <p id="tools-ad-exemption-help">开启后教师直接使用工具，家长仍按概率触发。</p>
      </div>
      <label class="tools-switch">
        <input type="checkbox" role="switch" name="teacherAdExempt" aria-labelledby="tools-ad-exemption"
          aria-describedby="tools-ad-exemption-help"${item.teacherAdExempt ? ' checked' : ''}>
        <span class="tools-switch-track" aria-hidden="true"></span>
      </label>
    </div>
  </div>`;
}

function readToolForm(form) {
  const fields = form.elements;
  return {
    name: fields.namedItem('name').value.trim(),
    key: fields.namedItem('key').value.trim(),
    parentVisible: fields.namedItem('parentVisible').checked,
    teacherVisible: fields.namedItem('teacherVisible').checked,
    adEnabled: fields.namedItem('adEnabled').checked,
    adProbability: fields.namedItem('adProbability').valueAsNumber,
    teacherAdExempt: fields.namedItem('teacherAdExempt').checked,
  };
}

function toolProblem(tool, tools, ownIndex = -1) {
  const name = tool.name.trim();
  const key = tool.key.trim();
  if (!name) return { field: 'name', message: '请填写工具名称。' };
  if (!TOOL_KEY.test(key)) return { field: 'key', message: '工具标识须填写英文字母、数字、下划线或连字符。' };
  if (tools.some((item, index) => index !== ownIndex && item.key.trim() === key)) {
    return { field: 'key', message: '此分类中已使用这个工具标识。' };
  }
  if (!Number.isInteger(tool.adProbability) || tool.adProbability < 0 || tool.adProbability > 100) {
    return { field: 'adProbability', message: '触发概率须为 0 至 100 的整数。' };
  }
  return null;
}

function toolRow(item, index, count, scope) {
  const connected = scope.toolNames.has(item.key);
  const roles = ROLES.filter(([field]) => item[field]).map(([, label]) => label).join('、') || '均隐藏';
  return `<li class="tools-entry" data-tools-row="${index}">
    <div class="tools-icon-preview tools-icon-list-preview" aria-hidden="true">${iconArtwork(iconUrl(scope.path, item.iconId), item.name)}</div>
    <div class="tools-entry-copy">
      <div class="tools-entry-title">
        <strong>${h(item.name)}</strong>
        <span class="tools-tool-status${connected ? ' tools-tool-connected' : ''}">${connected ? '已接入' : '待接入'}</span>
      </div>
      <div class="tools-entry-details">
        <code>${h(item.key)}</code><span>${roles}</span>
        <span>激励视频 ${item.adEnabled ? item.adProbability + '%' : '关闭'}</span>
        ${item.teacherAdExempt ? '<span>教师端免广告</span>' : ''}
      </div>
    </div>
    <div class="tools-entry-actions">
      ${control('上移', 'move-tool-up', { disabled: index === 0, style: 'text-button', label: '向上移动 ' + item.name })}
      ${control('下移', 'move-tool-down', { disabled: index === count - 1, style: 'text-button', label: '向下移动 ' + item.name })}
      ${control('编辑', 'edit-tool', { style: 'text-button', label: '编辑 ' + item.name })}
      ${control('移除', 'remove-tool', { style: 'text-button text-button-danger', label: '移除 ' + item.name })}
    </div>
  </li>`;
}

function categoriesView(scope) {
  const { categories } = scope.draft;
  return `<section class="tools-categories" aria-label="工具分类">
    <header class="tools-section-head">
      <div><h2>工具分类</h2><span>${categories.length} 个分类</span></div>
      ${control('新增分类', 'add-category', { disabled: categories.length >= MAX_CATEGORIES, style: 'button button-outline' })}
    </header>
    ${categories.length ? `<nav class="tools-category-list" aria-label="选择工具分类">${categories.map(category => `
      <button type="button" class="tools-category-choice" data-tools-action="select-category" data-key="${h(category.id)}"${category.id === scope.selected ? ' aria-current="true"' : ''}>
        <span class="tools-category-name">${h(category.name.trim() || '未命名分类')}</span>
        <span class="tools-category-size">${category.tools.length} 个工具</span>
      </button>`).join('')}</nav>` : '<p class="tools-empty-list">暂无分类</p>'}
  </section>`;
}

function categoryEditor(scope) {
  const { categories } = scope.draft;
  const category = categories.find(item => item.id === scope.selected);
  if (!category) return `<section class="tools-editor tools-empty-editor">
      <h2>还没有工具分类</h2><p>新增分类后，可在分类里添加工具并设置展示角色。</p>
    </section>`;
  const position = categories.indexOf(category);
  return `<section class="tools-editor" aria-label="编辑工具分类">
    <header class="tools-section-head">
      <h2>编辑分类</h2>
      <div class="tools-editor-actions">
        ${control('上移', 'move-up', { disabled: position === 0, label: '向上移动分类', style: 'text-button' })}
        ${control('下移', 'move-down', { disabled: position === categories.length - 1, label: '向下移动分类', style: 'text-button' })}
        ${control('移除分类', 'remove-category', { style: 'text-button text-button-danger' })}
      </div>
    </header>
    <div class="tools-category-fields">
      <label class="field"><span>分类名称</span>
        <input type="text" required data-tools-field="name" maxlength="${NAME_LENGTH}" value="${h(category.name)}"
          aria-describedby="tools-category-problem" placeholder="例如 学习与效率">
      </label>
      <p id="tools-category-problem" class="form-error" data-tools-name-error hidden></p>
      ${visibility(category)}
    </div>
    <div class="tools-list">
      <header class="tools-section-head"><h3>分类下的工具</h3>
        ${control('新增工具', 'add-tool', { disabled: category.tools.length >= MAX_CATEGORY_TOOLS })}
      </header>
      ${category.tools.length === MAX_CATEGORY_TOOLS ? `<p class="tools-key-help">每个分类最多添加 ${MAX_CATEGORY_TOOLS} 个工具。</p>` : ''}
      ${category.tools.length ? `<ul class="tools-entry-list">${category.tools.map((item, index) => toolRow(item, index, category.tools.length, scope)).join('')}</ul>`
        : '<p class="tools-empty-list">此分类还没有添加工具。</p>'}
    </div>
  </section>`;
}

function isCatalogResponse(result) {
  const config = result?.settings;
  return Number.isSafeInteger(config?.revision) && config.revision >= 0
    && Array.isArray(config.categories) && Array.isArray(result.availableTools);
}

function newCategory() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return { id, name: '', parentVisible: true, teacherVisible: true, tools: [] };
}

function selectedCategory(scope) {
  return scope.draft.categories.find(item => item.id === scope.selected);
}

function isDirty(scope) {
  return JSON.stringify(scope.draft) !== JSON.stringify(scope.saved);
}

function roleCounts(enabled, categories) {
  return ROLES.map(([key, label]) => {
    const count = enabled ? categories.reduce((total, category) => total + (category[key]
      ? category.tools.filter(tool => tool[key]).length : 0), 0) : 0;
    return `<span>${label}可见 <strong>${count}</strong> 项</span>`;
  }).join('');
}

export function createToolsWorkspace({ root, handleUnauthorized, showToast }) {
  let organization = null;
  let catalog = null;
  let iconEditor = null;
  root.classList.add('tools-workspace');
  root.hidden = true;

  function syncCatalogState() {
    const dirty = isDirty(catalog);
    root.querySelector('[data-tools-status]').textContent = catalog.saving ? '正在保存…'
      : catalog.conflict ? '目录已在其他窗口更新' : dirty ? '有未保存的修改' : '目录已同步';
    root.querySelector('[data-tools-save]').disabled = catalog.saving || !dirty || catalog.conflict;
    root.querySelector('[data-tools-action="reset"]').disabled = catalog.saving || !dirty || catalog.conflict;
  }

  function syncOrganizationState() {
    if (!organization?.draft) return;
    const { enabled, adsEnabled } = organization.draft;
    const dirty = isDirty(organization);
    root.querySelector('[data-tools-org-status]').textContent = organization.saving ? '正在保存…'
      : organization.conflict ? '机构设置已在其他窗口更新' : dirty ? '有未保存的修改' : '设置已同步';
    root.querySelector('[data-tools-org-save]').disabled = organization.saving || !dirty || organization.conflict;
    const enabledText = root.querySelector('[data-tools-enabled-text]');
    enabledText.textContent = enabled ? '已开启' : '已关闭';
    enabledText.classList.toggle('tools-state-on', enabled);
    const adsText = root.querySelector('[data-tools-ads-text]');
    adsText.textContent = adsEnabled ? '已开启' : '已暂停';
    adsText.classList.toggle('tools-state-on', adsEnabled);
    root.querySelector('[data-tools-counts]').innerHTML = catalog.saved ? roleCounts(enabled, catalog.saved.categories) : '';
  }

  function renderOrganization() {
    const container = root.querySelector('[data-tools-organization-settings]');
    if (!organization) {
      container.textContent = '';
      return;
    }
    const current = organization;
    container.innerHTML = !current.draft ? `<section class="notice" role="status">
      <h3>${current.error ? '读取机构设置失败' : '正在读取机构设置'}</h3>
      ${current.error ? `<p>${h(current.error)}</p>${control('重新加载', 'reload-organization')}` : ''}
    </section>` : `<form id="tools-organization-settings" novalidate>
      ${current.error ? `<div class="tools-error" role="alert"><p>${h(current.error)}</p>
        ${current.conflict ? control('读取最新机构设置', 'reload-organization') : ''}
      </div>` : ''}
      <fieldset class="tools-fields"${current.saving || current.conflict ? ' disabled' : ''}>
        <section class="tools-switch-card" aria-label="小程序展示设置">
          <div class="tools-switch-copy">
            <div class="tools-switch-heading"><h2 id="tools-enabled-label">实用工具总开关</h2><span data-tools-enabled-text></span></div>
            <p id="tools-enabled-help">控制当前机构的小程序底部是否显示「实用工具」。</p>
          </div>
          <label class="tools-switch">
            <input type="checkbox" role="switch" data-tools-field="enabled" aria-labelledby="tools-enabled-label"
              aria-describedby="tools-enabled-help"${current.draft.enabled ? ' checked' : ''}>
            <span class="tools-switch-track" aria-hidden="true"></span>
          </label>
          <div class="tools-counts" data-tools-counts></div>
        </section>
        <section class="tools-switch-card" aria-labelledby="tools-ads-label">
          <div class="tools-switch-copy">
            <div class="tools-switch-heading"><h2 id="tools-ads-label">广告总开关</h2><span data-tools-ads-text></span></div>
            <p id="tools-ads-help">关闭时暂停当前机构的所有横幅广告和工具激励视频，重新开启后按已保存的设置展示。</p>
          </div>
          <label class="tools-switch">
            <input type="checkbox" role="switch" data-tools-field="adsEnabled" aria-labelledby="tools-ads-label"
              aria-describedby="tools-ads-help"${current.draft.adsEnabled ? ' checked' : ''}>
            <span class="tools-switch-track" aria-hidden="true"></span>
          </label>
        </section>
        ${bannerSettings(current.draft.banners)}
      </fieldset>
      <div class="tools-save-controls tools-organization-save">
        <span data-tools-org-status role="status"></span>
        <button type="submit" class="button button-primary" data-tools-org-save>保存机构设置</button>
      </div>
    </form>`;
    syncOrganizationState();
  }

  function renderCatalog() {
    root.querySelector('[data-tools-catalog]').innerHTML = `<header class="tools-catalog-heading tools-section-head">
      <div><h2 id="tools-catalog-title">平台工具目录</h2><p>分类、工具和激励视频设置对所有机构统一生效。</p></div>
      ${catalog.draft ? `<div class="tools-save-controls">
        <span data-tools-status role="status"></span>
        ${control('撤销修改', 'reset')}
        <button type="submit" form="tools-settings" class="button button-primary" data-tools-save>保存平台目录</button>
      </div>` : ''}
    </header>
    ${!catalog.draft ? `<section class="notice" role="status">
      <h3>${catalog.error ? '读取平台目录失败' : '正在读取平台目录'}</h3>
      ${catalog.error ? `<p>${h(catalog.error)}</p>${control('重新加载', 'reload')}` : ''}
    </section>` : `<form id="tools-settings" novalidate>
      ${catalog.error ? `<div class="tools-error" role="alert"><p>${h(catalog.error)}</p>
        ${catalog.conflict ? control('舍弃草稿并读取最新平台目录', 'reload') : ''}
      </div>` : ''}
      <fieldset class="tools-fields"${catalog.saving || catalog.conflict ? ' disabled' : ''}>
        <div class="tools-config">${categoriesView(catalog)}${categoryEditor(catalog)}</div>
      </fieldset>
    </form>`}`;
    if (catalog.draft) syncCatalogState();
    syncOrganizationState();
  }

  function renderCategory(focus = null) {
    const config = root.querySelector('.tools-config');
    config.innerHTML = categoriesView(catalog) + categoryEditor(catalog);
    syncCatalogState();
    if (focus) config.querySelector(focus)?.focus({ preventScroll: true });
  }

  function reportNameError() {
    const input = root.querySelector('.tools-category-fields [data-tools-field="name"]');
    const error = root.querySelector('[data-tools-name-error]');
    input.setAttribute('aria-invalid', 'true');
    error.textContent = '请填写分类名称。';
    error.hidden = false;
    input.focus();
  }

  function showToolProblem(form, problem, focus = false) {
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
    for (const error of form.querySelectorAll('[data-tools-tool-error], [data-tools-ad-error]')) {
      const matchesField = Boolean(problem) && error.hasAttribute('data-tools-ad-error') === (problem.field === 'adProbability');
      error.hidden = !matchesField;
      error.textContent = matchesField ? problem.message : '';
    }
    if (!problem) return;
    const input = form.elements.namedItem(problem.field);
    input.setAttribute('aria-invalid', 'true');
    if (focus) input.focus();
  }

  function clearIconEditor() {
    if (iconEditor?.previewUrl) URL.revokeObjectURL(iconEditor.previewUrl);
    iconEditor = null;
  }

  function reportIconError(editor, message = '') {
    const error = editor.form.querySelector('[data-tools-icon-error]');
    error.textContent = message;
    error.hidden = !message;
  }

  function renderIconEditor(editor) {
    const { form, file, icon, iconId, path, previewUrl, uploading } = editor;
    const hasIcon = Boolean(file || iconId || icon);
    const preview = form.querySelector('[data-tools-icon-preview]');
    preview.innerHTML = iconArtwork(previewUrl || iconUrl(path, iconId), form.elements.namedItem('name').value);
    form.querySelector('[data-tools-action="choose-icon"]').textContent = hasIcon ? '更换图片' : '上传图片';
    form.querySelector('[data-tools-action="clear-icon"]').hidden = !hasIcon;
    form.querySelector('[data-tools-icon-label]').textContent = uploading ? '正在上传图标…'
      : file ? file.name : iconId ? '已上传图标' : icon ? '原有图标' : '默认图标';
    for (const control of form.querySelectorAll('.editor-body input, .editor-body button')) control.disabled = uploading;
    form.querySelector('button[type="submit"]').disabled = uploading;
  }

  function chooseIconFile(editor, file) {
    if (!ICON_TYPES.includes(file.type) || !file.size || file.size > MAX_ICON_SIZE) {
      reportIconError(editor, '请选择 512 KB 以内的 PNG、JPG 或 WebP 图片。');
      return;
    }
    if (editor.previewUrl) URL.revokeObjectURL(editor.previewUrl);
    editor.file = file;
    editor.previewUrl = URL.createObjectURL(file);
    reportIconError(editor);
    renderIconEditor(editor);
  }

  function openToolEditor(current, index = -1) {
    const category = selectedCategory(current);
    if (!category || (index < 0 && category.tools.length >= MAX_CATEGORY_TOOLS)) return;
    const item = index < 0 ? NEW_TOOL : category.tools[index];
    if (!item) return;
    clearIconEditor();
    const dialog = root.querySelector('.tools-tool-dialog');
    dialog.innerHTML = `<form id="tools-tool-form" class="editor-form" data-tool-index="${index}" novalidate>
      <header class="editor-head">
        <div><h2 id="tools-tool-title">${index < 0 ? '新增工具' : '编辑工具'}</h2>
          <p>${h(category.name.trim() || '未命名分类')}</p></div>
        ${control('×', 'close-tool-editor', { label: '关闭', style: 'editor-close' })}
      </header>
      <div class="editor-body tools-tool-body">
        <div class="tools-tool-fields">${toolFields(item)}</div>
        <p class="tools-key-help" id="tools-key-help">小程序按工具标识匹配功能。可填写英文字母、数字、下划线或连字符。</p>
        <p class="form-error tools-tool-error" id="tools-tool-problem" data-tools-tool-error hidden></p>
        ${toolIconField()}
        ${visibility(item, true)}
        ${toolAdControls(item)}
      </div>
      <footer class="editor-foot editor-actions">
        ${control('取消', 'close-tool-editor')}
        <button type="submit" class="button button-primary">确定</button>
      </footer>
    </form>`;
    const form = dialog.querySelector('form');
    iconEditor = { form, path: current.path, iconId: item.iconId, icon: item.icon, file: null, previewUrl: '', uploading: false };
    renderIconEditor(iconEditor);
    dialog.addEventListener('close', () => {
      if (iconEditor?.form === form && !dialog.open) clearIconEditor();
    }, { once: true });
    dialog.showModal();
    form.elements.namedItem('name').focus();
    return form;
  }

  async function confirmTool(current, form) {
    const category = selectedCategory(current);
    const editor = iconEditor;
    if (!category || editor?.form !== form || editor.uploading) return;
    const index = Number(form.dataset.toolIndex);
    const item = readToolForm(form);
    const problem = toolProblem(item, category.tools, index);
    if (problem) {
      showToolProblem(form, problem, true);
      return;
    }
    const dialog = form.closest('dialog');
    if (editor.file) {
      const body = new FormData();
      body.append('file', editor.file);
      reportIconError(editor);
      editor.uploading = true;
      renderIconEditor(editor);
      try {
        const preview = form.querySelector('[data-tools-icon-preview] img');
        await preview.decode().catch(() => { throw new Error('无法读取这张图片，请重新选择。'); });
        if (catalog !== current || iconEditor !== editor || !dialog.open) return;
        const { id } = await request(`${editor.path}/icons`, { method: 'POST', body });
        if (catalog !== current || iconEditor !== editor || !dialog.open) return;
        if (typeof id !== 'string' || !id) throw new Error('未收到上传结果，请重试。');
        editor.iconId = id;
      } catch (error) {
        if (catalog !== current || iconEditor !== editor || !dialog.open || handleUnauthorized(error)) return;
        editor.uploading = false;
        renderIconEditor(editor);
        reportIconError(editor, error.message);
        return;
      }
    }
    Object.assign(item, { icon: editor.icon, iconId: editor.iconId });
    if (index < 0) category.tools.push({ ...NEW_TOOL, ...item });
    else Object.assign(category.tools[index], item);
    dialog.close();
    clearIconEditor();
    const row = index < 0 ? category.tools.length - 1 : index;
    renderCategory(`[data-tools-row="${row}"] [data-tools-action="edit-tool"]`);
  }

  function applyCatalog(current, result, selected = current.selected) {
    if (!isCatalogResponse(result)) throw new Error('平台目录格式异常，请重新加载。');
    current.toolNames = new Map(result.availableTools.map(item => [item.key, item.name]));
    current.saved = {
      revision: result.settings.revision,
      categories: result.settings.categories.map(category => ({
        ...category,
        tools: category.tools.map(tool => ({ ...TOOL_DEFAULTS, ...tool, name: tool.name ?? (current.toolNames.get(tool.key) || tool.key) })),
      })),
    };
    current.draft = structuredClone(current.saved);
    current.selected = current.draft.categories.some(item => item.id === selected)
      ? selected : current.draft.categories[0]?.id || '';
    current.error = '';
    current.conflict = false;
  }

  function applyOrganization(current, result) {
    const settings = result?.settings;
    const adsEnabled = settings?.adsEnabled === undefined ? true : settings.adsEnabled;
    if (typeof settings?.enabled !== 'boolean' || typeof adsEnabled !== 'boolean'
      || !Number.isSafeInteger(settings.revision) || settings.revision < 0
      || BANNER_PAGES.some(([key]) => typeof settings.banners?.[key] !== 'boolean')) {
      throw new Error('机构工具设置格式异常，请重新加载。');
    }
    current.saved = {
      enabled: settings.enabled,
      adsEnabled,
      revision: settings.revision,
      banners: Object.fromEntries(BANNER_PAGES.map(([key]) => [key, settings.banners[key]])),
    };
    current.draft = structuredClone(current.saved);
    current.error = '';
    current.conflict = false;
  }

  async function load(current, apply, render, isCurrent) {
    if (!current || current.loading || current.saving) return;
    current.draft = null;
    current.loading = true;
    current.error = '';
    render();
    try {
      const result = await request(current.path);
      if (isCurrent()) apply(current, result);
    } catch (error) {
      if (!isCurrent() || handleUnauthorized(error)) return;
      current.error = error.message;
    } finally {
      if (isCurrent()) {
        current.loading = false;
        render();
      }
    }
  }

  function loadOrganization(current) {
    return load(current, applyOrganization, renderOrganization, () => organization === current);
  }

  function loadCatalog(current) {
    return load(current, applyCatalog, renderCatalog, () => catalog === current);
  }

  async function saveOrganization(current) {
    if (!current?.draft || current.saving || current.conflict || !isDirty(current)) return;
    current.saving = true;
    current.error = '';
    renderOrganization();
    try {
      const result = await request(current.path, { method: 'PUT', body: current.draft });
      if (organization !== current) return;
      applyOrganization(current, result);
      showToast('当前机构的实用工具设置已保存。');
    } catch (error) {
      if (organization !== current || handleUnauthorized(error)) return;
      current.conflict = error.status === 409;
      current.error = current.conflict ? '其他账号已更新机构设置。请读取最新设置后重新调整。' : error.message;
    } finally {
      if (organization === current) {
        current.saving = false;
        renderOrganization();
      }
    }
  }

  async function saveCatalog(current) {
    if (!current?.draft || current.saving || current.conflict || !isDirty(current)) return;
    const invalid = current.draft.categories.find(item => !item.name.trim());
    if (invalid) {
      current.selected = invalid.id;
      renderCategory();
      reportNameError();
      return;
    }
    for (const category of current.draft.categories) {
      for (const [index, tool] of category.tools.entries()) {
        const problem = toolProblem(tool, category.tools, index);
        if (problem) {
          current.selected = category.id;
          renderCategory();
          const form = openToolEditor(current, index);
          showToolProblem(form, problem, true);
          return;
        }
      }
    }
    const body = { ...current.draft, categories: current.draft.categories.map(item => ({
      ...item,
      name: item.name.trim(),
      tools: item.tools.map(tool => ({ ...tool, key: tool.key.trim(), name: tool.name.trim() })),
    })) };
    current.saving = true;
    current.error = '';
    renderCatalog();
    try {
      const result = await request(current.path, { method: 'PUT', body });
      if (catalog !== current) return;
      applyCatalog(current, result);
      showToast('平台工具目录已保存，对所有机构生效。');
    } catch (error) {
      if (catalog !== current || handleUnauthorized(error)) return;
      current.conflict = error.status === 409;
      current.error = current.conflict ? '其他账号已保存更新。请读取最新设置后重新调整。' : error.message;
    } finally {
      if (catalog === current) {
        current.saving = false;
        renderCatalog();
      }
    }
  }

  root.addEventListener('input', event => {
    const input = event.target;
    const { toolsField: field, toolsBanner: banner } = input.dataset;
    if (input.form?.id === 'tools-organization-settings') {
      if (!organization?.draft || organization.saving || organization.conflict) return;
      if (field === 'enabled' || field === 'adsEnabled') organization.draft[field] = input.checked;
      else if (banner && Object.hasOwn(organization.draft.banners, banner)) organization.draft.banners[banner] = input.checked;
      else return;
      syncOrganizationState();
      return;
    }
    if (!catalog?.draft || catalog.saving) return;
    if (input.form?.id === 'tools-tool-form') {
      if (input.hasAttribute('aria-invalid')) showToolProblem(input.form, null);
      return;
    }
    if (!field) return;
    const category = selectedCategory(catalog);
    if (!category) return;
    if (field === 'name') {
      category.name = input.value;
      const current = root.querySelector('.tools-category-choice[aria-current] .tools-category-name');
      current.textContent = category.name.trim() || '未命名分类';
      input.removeAttribute('aria-invalid');
      root.querySelector('[data-tools-name-error]').hidden = true;
    } else category[field] = input.checked;
    syncCatalogState();
  });

  root.addEventListener('focusout', event => {
    const input = event.target;
    const form = input.form;
    if (!catalog?.draft || catalog.saving || form?.id !== 'tools-tool-form' || !form.closest('dialog').open) return;
    const category = selectedCategory(catalog);
    if (!category) return;
    const problem = toolProblem(readToolForm(form), category.tools, Number(form.dataset.toolIndex));
    if (problem?.field === input.name) showToolProblem(form, problem);
  });

  root.addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('[data-tools-icon-input]') || iconEditor?.form !== input.form || iconEditor.uploading) return;
    const file = input.files[0];
    input.value = '';
    if (file) chooseIconFile(iconEditor, file);
  });

  root.addEventListener('error', event => {
    if (event.target.matches('.tools-icon-preview img')) event.target.hidden = true;
  }, true);

  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-tools-action]');
    if (!button) return;
    const { toolsAction: action, key } = button.dataset;
    if (action === 'reload-organization') return void loadOrganization(organization);
    const current = catalog;
    if (!current || current.saving) return;
    if (action === 'reload') return void loadCatalog(current);
    if (!current.draft) return;
    const list = current.draft.categories;
    const category = selectedCategory(current);
    switch (action) {
      case 'add-category': {
        if (list.length >= MAX_CATEGORIES) return;
        const next = newCategory();
        list.push(next);
        current.selected = next.id;
        renderCategory('.tools-category-fields [data-tools-field="name"]');
        break;
      }
      case 'select-category':
        if (!list.some(item => item.id === key)) return;
        current.selected = key;
        renderCategory('.tools-category-choice[aria-current]');
        break;
      case 'remove-category': {
        if (!category) return;
        const position = list.indexOf(category);
        list.splice(position, 1);
        current.selected = (list[position] || list[position - 1])?.id || '';
        renderCategory(current.selected ? '.tools-category-choice[aria-current]' : '[data-tools-action="add-category"]');
        break;
      }
      case 'move-up':
      case 'move-down': {
        if (!category) return;
        const index = list.indexOf(category);
        const next = index + (action === 'move-up' ? -1 : 1);
        if (next < 0 || next >= list.length) return;
        [list[index], list[next]] = [list[next], list[index]];
        renderCategory('.tools-category-choice[aria-current]');
        break;
      }
      case 'add-tool':
        openToolEditor(current);
        break;
      case 'edit-tool':
        openToolEditor(current, Number(button.closest('[data-tools-row]').dataset.toolsRow));
        break;
      case 'move-tool-up':
      case 'move-tool-down': {
        const row = button.closest('[data-tools-row]');
        if (!category || !row) return;
        const { tools } = category;
        const index = Number(row.dataset.toolsRow);
        const step = action === 'move-tool-up' ? -1 : 1;
        const next = index + step;
        if (next < 0 || next >= tools.length) return;
        [tools[index], tools[next]] = [tools[next], tools[index]];
        const nextRow = `[data-tools-row="${next}"]`;
        renderCategory(`${nextRow} [data-tools-action="${action}"]:not(:disabled), ${nextRow} [data-tools-action="edit-tool"]`);
        break;
      }
      case 'close-tool-editor':
        button.closest('dialog').close();
        clearIconEditor();
        break;
      case 'choose-icon':
        iconEditor?.form.querySelector('[data-tools-icon-input]').click();
        break;
      case 'clear-icon':
        if (!iconEditor) return;
        if (iconEditor.previewUrl) URL.revokeObjectURL(iconEditor.previewUrl);
        Object.assign(iconEditor, { iconId: '', icon: '', file: null, previewUrl: '' });
        reportIconError(iconEditor);
        renderIconEditor(iconEditor);
        iconEditor.form.querySelector('[data-tools-action="choose-icon"]').focus();
        break;
      case 'remove-tool': {
        const row = button.closest('[data-tools-row]');
        if (!category || !row) return;
        category.tools.splice(Number(row.dataset.toolsRow), 1);
        renderCategory('[data-tools-action="add-tool"]');
        break;
      }
      case 'reset':
        current.draft = structuredClone(current.saved);
        current.selected = selectedCategory(current)?.id || current.draft.categories[0]?.id || '';
        current.error = '';
        renderCatalog();
        root.querySelector('.tools-category-choice[aria-current], [data-tools-action="add-category"]')?.focus({ preventScroll: true });
        break;
    }
  });

  root.addEventListener('submit', event => {
    if (event.target.id === 'tools-tool-form' && catalog?.draft && !catalog.saving) {
      event.preventDefault();
      void confirmTool(catalog, event.target);
    } else if (event.target.id === 'tools-settings') {
      event.preventDefault();
      void saveCatalog(catalog);
    } else if (event.target.id === 'tools-organization-settings') {
      event.preventDefault();
      void saveOrganization(organization);
    }
  });

  function hide() {
    clearIconEditor();
    organization = null;
    catalog = null;
    root.hidden = true;
    root.textContent = '';
  }

  return {
    show({ organizationId = '', organizationName = '' }) {
      if (catalog && (organization?.id ?? '') === organizationId) return;
      const firstOpen = !catalog;
      if (firstOpen) {
        catalog = { path: CATALOG_PATH, selected: '', saving: false };
        root.innerHTML = `<header class="tools-heading">
          <div><p class="tools-organization" data-tools-organization-name hidden></p><h1>实用工具</h1></div>
        </header>
        <div data-tools-organization-settings></div>
        <section data-tools-catalog aria-labelledby="tools-catalog-title"></section>
        <dialog class="tools-tool-dialog" aria-labelledby="tools-tool-title"></dialog>`;
      }
      organization = organizationId
        ? { id: organizationId, path: '/organizations/' + encodeURIComponent(organizationId) + '/tools', saving: false }
        : null;
      const name = root.querySelector('[data-tools-organization-name]');
      name.textContent = organizationName || organizationId;
      name.hidden = !organization;
      root.hidden = false;

      const tasks = [];
      if (organization) tasks.push(loadOrganization(organization));
      else renderOrganization();
      if (firstOpen) tasks.push(loadCatalog(catalog));
      return Promise.all(tasks);
    },
    hide,
  };
}
