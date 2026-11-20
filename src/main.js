import './style.css';
import { ADMIN_MENUS, adminMenuKeys, canAccessAdminMenu } from './admin-menus.js';
import { request } from './api.js';
import { installDatePicker } from './date-picker.js';
import { createFinanceWorkspace } from './finance.js';
import { createHomeworkDrawer } from './homework.js';
import { createMealExpenseWorkspace } from './meal-expenses.js';
import { createMealsWorkspace } from './meals.js';
import { createToolsWorkspace } from './tools.js';
import { createRegistrationCodeFile } from './registration-code-export.js';
import { accountOrganizationChoices, assignmentButtonLabel, canSetTeacherPermissions, codesView, editorOptionPages, editorView, enrollmentCodeCard, enrollmentCodeLabels, entityNames, loginView, recordsList, waitingView, workspaceView } from './views.js';

const app = document.querySelector('#app');
installDatePicker();
const dialog = document.querySelector('#editor');
const toast = document.querySelector('#toast');
const homework = createHomeworkDrawer(document.querySelector('#homework'), document.querySelector('#homework-preview'), handleUnauthorized);
const financeRoot = document.createElement('div');
const finance = createFinanceWorkspace({ root: financeRoot, handleUnauthorized, showToast });
const mealsRoot = document.createElement('div');
const meals = createMealsWorkspace({ root: mealsRoot, handleUnauthorized, showToast, createExpenseWorkspace: createMealExpenseWorkspace });
const toolsRoot = document.createElement('div');
const tools = createToolsWorkspace({ root: toolsRoot, handleUnauthorized, showToast });
const menuWorkspaces = {
  finance: { controller: finance, root: financeRoot },
  meals: { controller: meals, root: mealsRoot },
  tools: { controller: tools, root: toolsRoot },
};
const forbiddenMenus = { MENU_FORBIDDEN: 'personnel', FINANCE_FORBIDDEN: 'finance', MEALS_FORBIDDEN: 'meals', TOOLS_FORBIDDEN: 'tools' };
const ORGANIZATIONS_PAGE_SIZE = 10;
const RECORDS_PAGE_SIZE = 20;
const OPTIONS_PAGE_SIZE = 20;

const state = {
  session: null,
  organizations: [],
  organizationsPage: null,
  organizationId: '',
  currentOrganization: null,
  detail: null,
  loadingOrganizations: false,
  loadingOrganization: false,
  organizationsError: '',
  organizationError: '',
  directoryOpen: false,
  section: 'organizations',
  accounts: [],
  accountsPage: null,
  organizationNames: {},
  accountsLoading: false,
  accountsError: '',
  codes: [],
  codesOpen: false,
  codesLoaded: false,
  codeGenerationAvailable: true,
  codeGenerationMode: 'wechat',
  codeVersion: 'release',
  codesLoading: false,
  codesError: '',
  selectedStudents: new Map(),
  tab: 'teachers',
  records: [],
  recordsPage: null,
  recordsLoading: false,
  recordsError: '',
  search: '',
  status: 'all',
  teacherFilter: '',
};

let sessionVersion = 0;
let directoryVersion = 0;
let organizationVersion = 0;
let recordsVersion = 0;
let accountsVersion = 0;
let codesVersion = 0;
let editor = null;
let toastTimer;
let searchTimer;

function pagePath(path, page, pageSize, filters = {}) {
  return path + '?' + new URLSearchParams({ page, pageSize, ...filters });
}

function lastPage(result) {
  return Math.max(1, Math.ceil(result.total / result.pageSize));
}

async function requestPage(path, page, pageSize, filters) {
  const result = await request(pagePath(path, page, pageSize, filters));
  if (!Array.isArray(result.items) || !Number.isInteger(result.total) || !Number.isInteger(result.pageSize)) {
    throw new Error('列表返回格式异常，请重试。');
  }
  return result.page > lastPage(result)
    ? request(pagePath(path, lastPage(result), pageSize, filters))
    : result;
}

function renderWorkspace() {
  const focused = document.activeElement;
  const sidebarFocus = focused?.closest('.sidebar');
  app.innerHTML = workspaceView(state);
  updateStudentSelectionControls();
  for (const [key, { root }] of Object.entries(menuWorkspaces)) {
    const host = app.querySelector('#' + key + '-slot') || document.body;
    if (root.parentNode !== host) host.append(root);
  }
  if (sidebarFocus) {
    const match = [...app.querySelectorAll('.sidebar button[data-action]:not(:disabled)')].find(button =>
      button.dataset.action === focused.dataset.action && button.dataset.key === focused.dataset.key && !button.closest('[hidden]'));
    (match || app.querySelector(state.directoryOpen ? '.directory-heading h2' : '.directory-toggle'))?.focus({ preventScroll: true });
  }
}

function setDirectoryOpen(open, returnFocus = false) {
  state.directoryOpen = open;
  const toggle = app.querySelector('.directory-toggle');
  const directory = app.querySelector('#directory');
  if (!toggle || !directory) return;
  toggle.setAttribute('aria-expanded', String(open));
  directory.hidden = !open;
  if (returnFocus) toggle.focus();
}

function renderRecords() {
  const list = document.querySelector('#records-list');
  if (list && state.detail) list.innerHTML = recordsList(state);
  updateStudentSelectionControls();
}

function renderEnrollmentPanel() {
  const body = document.querySelector('#organization-codes-body');
  if (!body) return;
  document.querySelector('[data-action="toggle-codes"]').setAttribute('aria-expanded', String(state.codesOpen));
  body.hidden = !state.codesOpen;
  body.innerHTML = state.codesOpen ? codesView(state) : '';
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

function formError(form, message = '') {
  const field = form.querySelector('.form-error');
  field.textContent = message;
  field.hidden = !message;
}

function resetFilters() {
  state.search = '';
  state.status = 'all';
  state.teacherFilter = '';
  state.selectedStudents.clear();
}

function hideMenuWorkspaces(except) {
  for (const [key, { controller }] of Object.entries(menuWorkspaces)) {
    if (key !== except) controller.hide();
  }
}

function setLogin(message) {
  sessionVersion++;
  directoryVersion++;
  organizationVersion++;
  recordsVersion++;
  accountsVersion++;
  codesVersion++;
  clearTimeout(searchTimer);
  if (dialog.open) dialog.close();
  homework.close();
  hideMenuWorkspaces();
  editor = null;
  state.session = null;
  state.organizations = [];
  state.organizationsPage = null;
  state.organizationId = '';
  state.currentOrganization = null;
  state.detail = null;
  state.organizationsError = '';
  state.organizationError = '';
  state.loadingOrganizations = false;
  state.loadingOrganization = false;
  state.directoryOpen = false;
  state.section = 'organizations';
  state.accounts = [];
  state.accountsPage = null;
  state.organizationNames = {};
  state.accountsLoading = false;
  state.accountsError = '';
  state.codes = [];
  state.codesOpen = false;
  state.codesLoaded = false;
  state.codeGenerationAvailable = true;
  state.codeGenerationMode = 'wechat';
  state.codeVersion = 'release';
  state.codesLoading = false;
  state.codesError = '';
  state.tab = 'teachers';
  state.records = [];
  state.recordsPage = null;
  state.recordsLoading = false;
  state.recordsError = '';
  resetFilters();
  app.innerHTML = loginView(message);
}

function handleUnauthorized(error) {
  if (error.status === 401) {
    setLogin('登录已失效，请重新登录。');
    return true;
  }
  const menu = Object.hasOwn(forbiddenMenus, error.code) ? forbiddenMenus[error.code] : null;
  if (!menu) return false;
  if (state.session?.role === 'institution' && canAccessAdminMenu(state.session, menu)) {
    state.session = { ...state.session, menuKeys: adminMenuKeys(state.session).filter(key => key !== menu) };
    organizationVersion++;
    recordsVersion++;
    codesVersion++;
    editor = null;
    if (dialog.open) dialog.close();
    homework.close();
    hideMenuWorkspaces();
    void restoreSession();
  }
  return true;
}

function organizationPreferenceKey() {
  return `tuoguan.admin.organization.${state.session.role}.${state.session.username}`;
}

function rememberedOrganizationId() {
  try {
    const id = localStorage.getItem(organizationPreferenceKey()) || '';
    return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

function rememberOrganizationId(id) {
  try {
    const key = organizationPreferenceKey();
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {}
}

async function restoreSession() {
  app.innerHTML = waitingView();
  try {
    state.session = await request('/session');
  } catch (error) {
    setLogin(error.status === 401 ? '' : error.message);
    return;
  }
  state.section = organizationSection();
  await loadOrganizations();
}

function organizationSection() {
  const allowed = ADMIN_MENUS.filter(({ key }) => canAccessAdminMenu(state.session, key))
    .map(({ key }) => key === 'personnel' ? 'organizations' : key);
  return allowed.includes(state.section) ? state.section : allowed[0] || 'organizations';
}

async function loadOrganizations(preferredId = state.organizationId || rememberedOrganizationId(), page = state.organizationsPage?.page || 1, browse = false) {
  const session = sessionVersion;
  const sequence = ++directoryVersion;
  state.loadingOrganizations = true;
  state.organizationsError = '';
  renderWorkspace();
  try {
    const result = await requestPage('/organizations', page, ORGANIZATIONS_PAGE_SIZE, { include: preferredId });
    if (session !== sessionVersion || sequence !== directoryVersion) return;
    state.organizations = result.items;
    state.organizationsPage = result;
    state.loadingOrganizations = false;
    if (browse) return renderWorkspace();
    const next = result.selected || state.organizations.find(item => item.id === preferredId) || state.organizations[0];
    if (!next) rememberOrganizationId('');
    await loadOrganization(next?.id || '', next);
  } catch (error) {
    if (session !== sessionVersion || sequence !== directoryVersion || handleUnauthorized(error)) return;
    state.loadingOrganizations = false;
    state.organizationsError = error.message;
    renderWorkspace();
  }
}

async function loadOrganization(id = state.organizationId, organization = state.organizations.find(item => item.id === id), section = organizationSection()) {
  const hasPersonnel = section === 'organizations' && canAccessAdminMenu(state.session, 'personnel');
  const hasPlatformCatalog = section === 'tools' && canAccessAdminMenu(state.session, 'tools');
  hideMenuWorkspaces(state.organizationId === id || hasPlatformCatalog ? section : undefined);
  const sequence = ++organizationVersion;
  recordsVersion++;
  clearTimeout(searchTimer);
  codesVersion++;
  const changed = state.organizationId !== id;
  state.section = section;
  state.organizationId = id;
  if (changed || organization) state.currentOrganization = organization || null;
  state.detail = null;
  state.organizationError = '';
  state.records = [];
  state.recordsError = '';
  state.recordsLoading = Boolean(id && hasPersonnel);
  state.directoryOpen = false;
  state.loadingOrganization = Boolean(id && hasPersonnel);
  state.codes = [];
  state.codesLoaded = false;
  state.codeGenerationAvailable = true;
  state.codeGenerationMode = 'wechat';
  state.codesLoading = false;
  state.codesError = '';
  state.selectedStudents.clear();
  if (changed) {
    state.codesOpen = false;
    state.tab = 'teachers';
    state.recordsPage = null;
    resetFilters();
  }
  renderWorkspace();
  if (!id && !hasPlatformCatalog) return;
  if (!hasPersonnel) {
    if (id) rememberOrganizationId(id);
    if (Object.hasOwn(menuWorkspaces, section) && canAccessAdminMenu(state.session, section)) {
      await menuWorkspaces[section].controller.show({ organizationId: id, organizationName: state.currentOrganization?.name || id });
    }
    return;
  }
  try {
    const result = await request('/organizations/' + encodeURIComponent(id) + '?view=summary');
    if (sequence !== organizationVersion) return;
    if (!result.organization || !Array.isArray(result.teachers) || !result.counts) {
      throw new Error('机构资料返回格式异常，请重试。');
    }
    state.detail = result;
    state.currentOrganization = result.organization;
    rememberOrganizationId(id);
  } catch (error) {
    if (sequence !== organizationVersion || handleUnauthorized(error)) return;
    state.organizationError = error.message;
  } finally {
    if (sequence === organizationVersion) {
      state.loadingOrganization = false;
      renderWorkspace();
      if (state.detail && state.section === 'organizations') {
        void loadRecords(state.recordsPage?.page || 1);
        if (state.codesOpen) void loadCodes();
      }
    }
  }
}

async function loadAccounts(page = state.accountsPage?.page || 1) {
  if (state.session?.role !== 'platform') return;
  hideMenuWorkspaces();
  const sequence = ++accountsVersion;
  state.section = 'accounts';
  state.directoryOpen = false;
  state.accountsLoading = true;
  state.accountsError = '';
  renderWorkspace();
  try {
    const result = await requestPage('/accounts', page, RECORDS_PAGE_SIZE);
    if (sequence === accountsVersion) {
      state.accounts = result.items;
      state.accountsPage = result;
      state.organizationNames = result.organizationNames || {};
    }
  } catch (error) {
    if (sequence !== accountsVersion || handleUnauthorized(error)) return;
    state.accountsError = error.message;
  } finally {
    if (sequence === accountsVersion) {
      state.accountsLoading = false;
      if (state.section === 'accounts') renderWorkspace();
    }
  }
}

function organizationPath() {
  return '/organizations/' + encodeURIComponent(state.organizationId);
}

async function loadRecords(page = 1) {
  if (!state.detail || state.section !== 'organizations') return;
  const sequence = ++recordsVersion;
  const path = organizationPath() + '/records/' + state.tab;
  const filters = { search: state.search.trim(), status: state.status, teacherFilter: state.teacherFilter };
  state.recordsLoading = true;
  state.recordsError = '';
  renderRecords();
  try {
    const result = await requestPage(path, page, RECORDS_PAGE_SIZE, filters);
    if (sequence !== recordsVersion) return;
    state.records = result.items;
    state.recordsPage = result;
  } catch (error) {
    if (sequence !== recordsVersion || handleUnauthorized(error)) return;
    state.records = [];
    state.recordsError = error.message;
  } finally {
    if (sequence === recordsVersion) {
      state.recordsLoading = false;
      if (state.section === 'organizations') renderRecords();
    }
  }
}

async function loadCodes() {
  const sequence = ++codesVersion;
  const path = organizationPath() + '/enrollment-codes';
  state.codesLoading = true;
  state.codesError = '';
  if (codesVisible()) renderEnrollmentPanel();
  try {
    const response = await request(path);
    if (sequence !== codesVersion) return;
    if (!Array.isArray(response.items)) throw new Error('登记码返回格式异常，请重试。');
    state.codes = response.items;
    state.codesLoaded = true;
    state.codeGenerationAvailable = response.canGenerate !== false;
    state.codeGenerationMode = response.mode || 'wechat';
  } catch (error) {
    if (sequence !== codesVersion || handleUnauthorized(error)) return;
    state.codesError = error.message;
  } finally {
    if (sequence === codesVersion) {
      state.codesLoading = false;
      if (codesVisible()) renderEnrollmentPanel();
    }
  }
  if (sequence !== codesVersion || !codesVisible() || state.codesError) return;
  await refreshCodeImages();
}

function codesVisible() {
  return Boolean(state.detail && state.codesOpen && state.section === 'organizations');
}

async function refreshCodeImages() {
  if (!state.codeGenerationAvailable) return;
  const missingImages = state.codes.filter(code => (code.enabled || !code.configured) && !code.imageUrl && !code.error);
  await Promise.all(missingImages.map(code => updateCode(code, 'ensure')));
}

function renderCodeCard(code, focusAction = '') {
  if (!codesVisible()) return;
  const selector = `[data-code-card="${code.type}"]`;
  const node = document.querySelector(selector);
  if (!node) return;
  const focused = node.contains(document.activeElement);
  const previousAction = focused ? document.activeElement.dataset.action : '';
  node.outerHTML = enrollmentCodeCard(code, state);
  if (focusAction || focused) {
    const next = document.querySelector(selector);
    const target = next.querySelector(`[data-action="${focusAction || previousAction}"]`)
      || next.querySelector('.code-download, .code-actions button')
      || next;
    target.focus();
  }
}

function codeImage(result) {
  const { imageMime, imageBase64 } = result;
  if (!['image/png', 'image/jpeg'].includes(imageMime) || typeof imageBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new Error('服务未返回有效二维码，请重试。');
  }
  return {
    imageUrl: `data:${imageMime};base64,${imageBase64}`,
  };
}

async function downloadCode(code, format) {
  if (!code?.enabled || !code.imageUrl || code.pending || code.downloading) return;
  const sequence = codesVersion;
  const imageUrl = code.imageUrl;
  const { title, subtitle, fileName } = enrollmentCodeLabels(code.type, state);
  code.downloading = format;
  renderCodeCard(code);
  try {
    const file = await createRegistrationCodeFile({ imageUrl, title, subtitle, format });
    if (sequence !== codesVersion || !code.enabled || code.pending || code.imageUrl !== imageUrl) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}.${format === 'pdf' ? 'pdf' : 'png'}`;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    if (sequence === codesVersion) showToast('生成下载文件失败，请重试。');
  } finally {
    code.downloading = '';
    if (sequence === codesVersion) renderCodeCard(code);
  }
}

async function updateCode(code, operation) {
  if (code.pending) return;
  const sequence = codesVersion;
  const path = organizationPath() + '/enrollment-codes/' + encodeURIComponent(code.type);
  code.pending = operation;
  code.error = '';
  code.confirmation = '';
  renderCodeCard(code);
  try {
    const result = await request(path, { method: 'POST', body: { operation, version: state.codeVersion } });
    if (sequence !== codesVersion) return;
    code.enabled = result.enabled === true;
    code.configured = result.configured === true;
    code.imageUrl = '';
    if (code.enabled) Object.assign(code, codeImage(result));
  } catch (error) {
    if (sequence !== codesVersion || handleUnauthorized(error)) return;
    code.error = error.message;
    code.retryOperation = operation;
  } finally {
    if (sequence === codesVersion) {
      code.pending = '';
      renderCodeCard(code);
    }
  }
}

function openEditor(entity, original, opener) {
  if (dialog.open || (entity !== 'organization' && entity !== 'account' && !state.detail)) return;
  editor = { entity, original, opener, saving: false };
  if (entity === 'account') {
    editor.organizations = new Set(original?.organizationIds || []);
    editor.options = { path: '/organizations' };
  } else if (entity === 'student' || entity === 'assign') {
    editor.options = { path: organizationPath() + '/options/teachers', select: 'teacherOpenid' };
  } else if (entity === 'review') {
    const teacher = original.type === 'teacher';
    editor.options = {
      path: organizationPath() + '/options/' + (teacher ? 'teachers' : 'students'),
      select: teacher ? 'teacherId' : 'studentId',
      ...(teacher ? { group: 'draft' } : {}),
    };
  }
  dialog.innerHTML = editorView(editor, state.detail, state.session);
  updateEditorSelectionControls();
  dialog.showModal();
  const initialFocus = entity === 'delete' ? '.editor-actions [data-action="close-editor"]'
    : '.editor-body input:not([readonly]), .editor-body select';
  dialog.querySelector(initialFocus)?.focus();
  if (editor.options) void loadEditorOptions(editor, 1);
}

function editorChoices(group) {
  return [...group.closest('fieldset').querySelectorAll('input[type="checkbox"]:not(:disabled)')];
}

function updateEditorSelectionControls() {
  for (const group of dialog.querySelectorAll('[data-editor-selection]')) {
    const choices = editorChoices(group);
    const organizations = group.dataset.editorSelection === 'organizationIds' ? editor.organizations : null;
    const optionsUnavailable = organizations && (editor.options.loading || editor.options.error);
    group.querySelector('[data-action="editor-select-all"]').disabled = Boolean(editor.saving || optionsUnavailable)
      || !choices.some(choice => !choice.checked);
    group.querySelector('[data-action="editor-clear-selection"]').disabled = editor.saving || (organizations
      ? !organizations.size : !choices.some(choice => choice.checked));
  }
}

function updateOrganizationSelectionCount() {
  dialog.querySelector('[data-organization-selection-count]').textContent = `已选 ${editor.organizations.size} 家机构`;
}

function setEditorSelections(group, selected) {
  if (!group || !editor || editor.saving) return;
  const organizations = group.dataset.editorSelection === 'organizationIds' ? editor.organizations : null;
  if (organizations && !selected) organizations.clear();
  for (const choice of editorChoices(group)) {
    choice.checked = selected;
    if (selected && organizations) organizations.add(choice.value);
  }
  if (organizations) updateOrganizationSelectionCount();
  updateEditorSelectionControls();
}

function renderEditorOptions(operation, result, suggested = '') {
  const options = operation.options;
  if (operation.entity === 'account') {
    const region = dialog.querySelector('[data-account-organization-options]');
    region.innerHTML = accountOrganizationChoices(result.items, operation.organizations)
      || '<p class="editor-hint">暂无可授权机构</p>';
    return;
  }
  const select = dialog.querySelector(`select[name="${options.select}"]`);
  const selected = select.value;
  const previous = select.options[select.selectedIndex];
  const pinned = [...select.options].filter(item => !item.value || item.value === 'auto');
  const candidates = options.select === 'studentId' && !options.search ? operation.original.candidates || [] : [];
  const ids = new Set();
  const rows = [...candidates, ...result.items, ...(result.selected ? [result.selected] : [])].flatMap(item => {
    const id = item.openid || item.id;
    if (!id || ids.has(id)) return [];
    ids.add(id);
    const label = options.select === 'studentId'
      ? [item.name, item.school, item.grade].filter(Boolean).join(' · ')
      : [item.name || '未命名老师', options.select === 'teacherId' ? item.phone : ''].filter(Boolean).join(' · ');
    return [new Option(label, id)];
  });
  if (previous?.value && previous.value !== 'auto' && !ids.has(previous.value)) rows.unshift(previous);
  select.replaceChildren(...pinned, ...rows);
  select.value = selected || suggested || '';
}

async function loadEditorOptions(operation, page = 1) {
  const options = operation.options;
  clearTimeout(options.timer);
  const sequence = options.version = (options.version || 0) + 1;
  options.loading = true;
  options.error = '';
  const region = dialog.querySelector('[data-editor-option-pages]');
  region.innerHTML = editorOptionPages(options);
  updateEditorSelectionControls();
  const selected = options.select ? dialog.querySelector(`select[name="${options.select}"]`).value : '';
  const filters = operation.entity === 'account' ? {} : {
    search: options.search || '',
    include: selected || (options.select === 'teacherOpenid' ? operation.original?.teacherOpenid || '' : ''),
    group: options.group || '',
  };
  try {
    const phone = !options.page && options.select === 'teacherId' && operation.original.teacher?.phone;
    const [result, matching] = await Promise.all([
      requestPage(options.path, page, OPTIONS_PAGE_SIZE, filters),
      phone ? requestPage(options.path, 1, OPTIONS_PAGE_SIZE, { ...filters, search: phone }).catch(() => null) : null,
    ]);
    if (editor !== operation || options.version !== sequence) return;
    const matches = (matching?.items || []).filter(item => item.name?.trim() === operation.original.teacher?.name?.trim()
      && item.phone?.replace(/\D/g, '') === phone.replace(/\D/g, ''));
    const suggestion = matches.length === 1 ? matches[0] : null;
    options.page = result;
    renderEditorOptions(operation, suggestion ? { ...result, items: [suggestion, ...result.items] } : result, suggestion?.openid);
  } catch (error) {
    if (editor !== operation || options.version !== sequence || handleUnauthorized(error)) return;
    options.error = error.message;
  } finally {
    if (editor === operation && options.version === sequence) {
      options.loading = false;
      region.innerHTML = editorOptionPages(options);
      updateEditorSelectionControls();
    }
  }
}

function closeEditor() {
  if (editor?.saving) return;
  dialog.close();
}

dialog.addEventListener('cancel', event => {
  if (editor?.saving) event.preventDefault();
});

dialog.addEventListener('close', () => {
  const opener = editor?.opener;
  clearTimeout(editor?.options?.timer);
  editor = null;
  dialog.innerHTML = '';
  if (opener?.isConnected) opener.focus();
});

function formValues(form) {
  const values = new FormData(form);
  return key => String(values.get(key) ?? '').trim();
}

function mobileNumber(value, label, required = false) {
  if (!value && required) throw new Error(`请输入${label}。`);
  if (value && !/^1[3-9]\d{9}$/.test(value)) {
    throw new Error(`请输入有效的${label}（11 位中国大陆手机号码）。`);
  }
  return value;
}

function guardianValues(value, prefix = '', original) {
  const contact = {
    guardianName: value(prefix + 'guardianName'), relationship: value(prefix + 'relationship'),
    contact1: value(prefix + 'contact1'), contact2: value(prefix + 'contact2'),
  };
  if (original && Object.entries(contact).every(([key, text]) => text === String(original[key] ?? '').trim())) return null;
  if (!contact.guardianName) throw new Error('请填写家长姓名。');
  if (!contact.relationship) throw new Error('请填写与孩子关系。');
  return {
    ...contact,
    contact1: mobileNumber(contact.contact1, '家长联系电话 1', true),
    contact2: mobileNumber(contact.contact2, '家长联系电话 2'),
  };
}

function entityPayload(entity, form, original) {
  const value = formValues(form);
  if (entity === 'account') {
    const fields = new FormData(form);
    const organizationIds = [...editor.organizations];
    if (!organizationIds.length) throw new Error('请至少选择一个授权机构。');
    const password = String(fields.get('password') ?? '');
    const menuKeys = fields.getAll('menuKeys').map(String);
    return { username: value('username'), ...(password ? { password } : {}), organizationIds, menuKeys, active: value('active') !== 'false' };
  }
  if (entity === 'teacherPermissions') {
    const keys = ['canReviewEnrollment'];
    if (canAccessAdminMenu(state.session, 'finance')) keys.push('canManageFinance');
    if (canAccessAdminMenu(state.session, 'meals')) keys.push('canManageMealExpenses');
    const permissions = keys.map(key => [key, value(key) === 'true']);
    return Object.fromEntries(permissions.filter(([key, enabled]) => enabled !== (original[key] === true)));
  }
  if (entity === 'review') {
    const decision = value('decision');
    const target = original.type === 'teacher' ? 'teacherId' : 'studentId';
    const id = value(target);
    return { decision, ...(decision === 'approve' && id ? { [target]: id } : {}) };
  }
  if (entity === 'assign') return { studentIds: original.students.map(student => student.id), teacherOpenid: value('teacherOpenid') };
  if (entity === 'unlink' || entity === 'delete') return undefined;
  const name = value('name');
  if (!name) throw new Error('请输入名称或姓名。');
  if (entity === 'organization') {
    return original ? { name } : { name, id: value('id') };
  }
  if (entity === 'teacher') {
    return {
      name,
      phone: mobileNumber(value('phone'), '教师联系电话', !original || original.status === 'unbound'),
      ...(value('status') ? { status: value('status') } : {}),
    };
  }

  const assignment = value('teacherOpenid');
  const bound = original?.boundParentContacts ?? [];
  const family = bound.length ? {
    boundParentContacts: bound.flatMap((contact, index) => {
      const changes = guardianValues(value, 'bound' + index + '-', contact);
      return changes ? [{ bindingId: contact.bindingId, ...changes }] : [];
    }),
  } : guardianValues(value);
  return {
    name,
    age: value('age') ? Number(value('age')) : null,
    school: value('school'),
    grade: value('grade'),
    ...family,
    active: value('active') !== 'false',
    ...(assignment !== 'auto' && assignment !== (original?.teacherOpenid || '')
      ? { teacherOpenid: assignment } : {}),
  };
}

function entityPath(entity, original) {
  if (entity === 'organization') {
    return original ? '/organizations/' + encodeURIComponent(original.id) : '/organizations';
  }
  if (entity === 'account') return '/accounts' + (original ? '/' + encodeURIComponent(original.username) : '');
  const organization = organizationPath();
  if (entity === 'delete') {
    if (original.kind === 'organization') return '/organizations/' + encodeURIComponent(original.id);
    return `${organization}/${original.kind}s/${encodeURIComponent(original.id)}`;
  }
  if (entity === 'review') return `${organization}/enrollment-requests/${encodeURIComponent(original.id)}`;
  if (entity === 'assign') return `${organization}/assign-students`;
  if (entity === 'unlink') return `${organization}/students/${encodeURIComponent(original.student.id)}/parents/${encodeURIComponent(original.parentId)}`;
  if (entity === 'teacherPermissions') return `${organization}/teachers/${encodeURIComponent(original.openid)}`;
  const collection = entity === 'teacher' ? 'teachers' : 'students';
  const base = organization + '/' + collection;
  if (!original) return base;
  return base + '/' + encodeURIComponent(entity === 'teacher' ? original.openid : original.id);
}

async function saveEditor(form) {
  if (!editor || editor.saving) return;
  if (editor.options?.loading) return formError(form, '正在读取选项，请稍候。');
  const operation = editor;
  const { entity, original } = operation;
  formError(form);
  const submit = form.querySelector('button[type="submit"]');
  const label = submit.textContent;
  try {
    const body = entityPayload(entity, form, original);
    operation.saving = true;
    form.setAttribute('aria-busy', 'true');
    for (const button of form.querySelectorAll('button')) button.disabled = true;
    submit.textContent = entity === 'delete' ? '正在删除' : '正在保存';
    const result = await request(entityPath(entity, original), {
      method: entity === 'unlink' || entity === 'delete' ? 'DELETE' : entity === 'assign' || !original ? 'POST' : 'PATCH',
      body,
    });
    if (editor !== operation) return;
    operation.saving = false;
    closeEditor();
    const completed = { review: '审核已提交', assign: '学生已分配', unlink: '绑定已解除', delete: '已删除', teacherPermissions: '权限已保存' };
    showToast(completed[entity] || (original ? '修改已保存' : entityNames[entity] + '已新增'));
    if (entity === 'organization') {
      await loadOrganizations(result?.organization?.id ?? original?.id ?? body.id);
    } else if (entity === 'delete' && original.kind === 'organization') {
      await loadOrganizations('');
      document.querySelector(state.organizationId ? '.directory-toggle' : '.empty-workspace button')?.focus();
    } else if (entity === 'account') {
      await loadAccounts();
    } else {
      if (!original) {
        resetFilters();
        state.recordsPage = null;
      }
      await loadOrganization();
      if (entity === 'delete') document.querySelector('.record-tabs [aria-pressed="true"]')?.focus();
    }
  } catch (error) {
    if (editor === operation && !handleUnauthorized(error)) formError(form, error.message);
  } finally {
    if (editor === operation && dialog.open) {
      operation.saving = false;
      form.removeAttribute('aria-busy');
      for (const button of form.querySelectorAll('button')) button.disabled = false;
      updateEditorSelectionControls();
      submit.textContent = label;
    }
  }
}

async function submitLogin(form) {
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  const values = new FormData(form);
  const username = String(values.get('username') ?? '').trim();
  const password = String(values.get('password') ?? '');
  formError(form);
  if (!username || !password) {
    formError(form, '请输入管理员账号和密码。');
    return;
  }

  form.setAttribute('aria-busy', 'true');
  submit.disabled = true;
  submit.textContent = '正在登录';
  try {
    await request('/session', { method: 'POST', body: { username, password } });
    await restoreSession();
  } catch (error) {
    formError(form, error.message);
    form.querySelector('input[name="password"]')?.select();
  } finally {
    form.removeAttribute('aria-busy');
    submit.disabled = false;
    submit.textContent = '登录';
  }
}

async function logout(button) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    await request('/session', { method: 'DELETE' });
    setLogin();
  } catch (error) {
    if (!handleUnauthorized(error)) showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function selectTab(tab, teacherFilter = '') {
  recordsVersion++;
  clearTimeout(searchTimer);
  state.tab = tab;
  resetFilters();
  state.records = [];
  state.recordsPage = null;
  state.recordsLoading = true;
  state.recordsError = '';
  state.teacherFilter = teacherFilter;
  if (teacherFilter) state.status = 'active';
  renderWorkspace();
  document.querySelector('.record-tabs [aria-pressed="true"]')?.focus();
  void loadRecords();
}

function updateStudentSelectionControls() {
  const button = app.querySelector('[data-action="assign-selected"]');
  if (!button) return;
  button.disabled = !state.selectedStudents.size;
  button.textContent = assignmentButtonLabel(state.selectedStudents.size);
  app.querySelector('[data-action="select-page-students"]').disabled = !app.querySelector('[data-student-choice]:not(:checked)');
  app.querySelector('[data-action="clear-selected-students"]').disabled = !state.selectedStudents.size;
}

function clearStudentSelection() {
  state.selectedStudents.clear();
  for (const choice of app.querySelectorAll('[data-student-choice]:checked')) choice.checked = false;
  updateStudentSelectionControls();
}

document.addEventListener('click', event => {
  if (state.directoryOpen && !dialog.open && !event.target.closest('.organization-switcher')) setDirectoryOpen(false);
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, key } = button.dataset;
  switch (action) {
    case 'toggle-directory':
      setDirectoryOpen(!state.directoryOpen);
      break;
    case 'select-organization':
      setDirectoryOpen(false, true);
      if (state.section === 'accounts' || key !== state.organizationId || state.organizationError) {
        void loadOrganization(key);
      }
      break;
    case 'reload-organizations':
      void loadOrganizations();
      break;
    case 'retry-directory':
      void loadOrganizations(state.organizationId || undefined, state.organizationsPage?.page || 1, Boolean(state.organizationId));
      break;
    case 'page-organizations':
      if (!state.loadingOrganizations) void loadOrganizations(state.organizationId, Number(key), true);
      break;
    case 'page-accounts':
      if (!state.accountsLoading) void loadAccounts(Number(key));
      break;
    case 'page-records':
    case 'reload-records':
      void loadRecords(Number(key) || state.recordsPage?.page || 1);
      break;
    case 'reload-organization':
      void loadOrganization();
      break;
    case 'open-accounts':
      void loadAccounts();
      break;
    case 'open-personnel':
      if (state.section !== 'organizations') void loadOrganization(undefined, undefined, 'organizations');
      break;
    case 'open-finance':
      if (state.section !== 'finance') void loadOrganization(undefined, undefined, 'finance');
      break;
    case 'open-meals':
      if (state.section !== 'meals' && canAccessAdminMenu(state.session, 'meals')) void loadOrganization(undefined, undefined, 'meals');
      break;
    case 'open-tools':
      if (state.section !== 'tools' && canAccessAdminMenu(state.session, 'tools')) void loadOrganization(undefined, undefined, 'tools');
      break;
    case 'student-finance-history': {
      const organizationId = state.organizationId;
      if (canAccessAdminMenu(state.session, 'finance') && organizationId) {
        finance.openStudent(key, { organizationId, anchor: button });
      }
      break;
    }
    case 'edit-account': {
      const account = state.accounts.find(item => item.username === key);
      if (account) openEditor('account', account, button);
      break;
    }
    case 'add':
      openEditor(key, null, button);
      break;
    case 'edit-organization':
      if (state.detail) openEditor('organization', state.detail.organization, button);
      break;
    case 'delete-organization': {
      const organization = state.detail?.organization;
      if (organization && state.session?.role === 'platform') {
        openEditor('delete', { kind: 'organization', id: organization.id, name: organization.name }, button);
      }
      break;
    }
    case 'edit-teacher': {
      const teacher = state.records.find(item => item.openid === key);
      if (teacher) openEditor('teacher', teacher, button);
      break;
    }
    case 'teacher-permissions': {
      const teacher = state.records.find(item => item.openid === key && item.status !== 'archived');
      if (canSetTeacherPermissions(teacher, state.session)) openEditor('teacherPermissions', teacher, button);
      break;
    }
    case 'edit-student': {
      const student = state.records.find(item => item.id === key);
      if (student) openEditor('student', student, button);
      break;
    }
    case 'student-homework': {
      const student = state.records.find(item => item.id === key);
      if (student && state.detail && !dialog.open) homework.open(student, organizationPath(), state.detail.organization.name, button);
      break;
    }
    case 'delete-teacher': {
      const teacher = state.records.find(item => item.openid === key && item.status !== 'archived');
      if (teacher) openEditor('delete', { kind: 'teacher', id: key, name: teacher.name || '未命名老师' }, button);
      break;
    }
    case 'delete-student': {
      const student = state.records.find(item => item.id === key && item.status !== 'archived');
      if (student) openEditor('delete', { kind: 'student', id: key, name: student.name }, button);
      break;
    }
    case 'delete-parent': {
      const parent = state.records.find(item => item.id === key);
      if (parent) openEditor('delete', { kind: 'parent', id: key, name: parent.guardianName || '未命名家长', childCount: parent.students.length }, button);
      break;
    }
    case 'assign-selected': {
      const students = [...state.selectedStudents.values()];
      if (students?.length) openEditor('assign', { students }, button);
      break;
    }
    case 'select-page-students':
      if (state.tab === 'students' && !state.recordsLoading && !state.recordsError) {
        for (const student of state.records) {
          if (student.active !== false) state.selectedStudents.set(student.id, student);
        }
        for (const choice of app.querySelectorAll('[data-student-choice]')) choice.checked = true;
        updateStudentSelectionControls();
      }
      break;
    case 'clear-selected-students':
      clearStudentSelection();
      break;
    case 'editor-select-all':
    case 'editor-clear-selection':
      setEditorSelections(button.closest('[data-editor-selection]'), action === 'editor-select-all');
      break;
    case 'review-request': {
      const item = state.records.find(item => item.id === key && ['pending', 'approved'].includes(item.status));
      if (item) openEditor('review', item, button);
      break;
    }
    case 'unlink-parent': {
      const parentId = button.dataset.parentId;
      const parent = state.records.find(item => item.id === parentId);
      const student = parent?.students.find(item => item.id === key);
      if (student) openEditor('unlink', { parentId, guardianName: student.guardianName || parent.guardianName, student }, button);
      break;
    }
    case 'toggle-codes':
      state.codesOpen = !state.codesOpen;
      if (state.codesOpen && !state.codesLoaded && !state.codesLoading) {
        void loadCodes();
      } else {
        renderEnrollmentPanel();
        if (state.codesOpen && state.codesLoaded) void refreshCodeImages();
      }
      break;
    case 'reload-codes':
      void loadCodes();
      break;
    case 'qr-download-image':
    case 'qr-download-pdf':
      void downloadCode(state.codes.find(item => item.type === key), action === 'qr-download-pdf' ? 'pdf' : 'image');
      break;
    case 'qr-rotate':
    case 'qr-disable': {
      const code = state.codes.find(item => item.type === key);
      if (!code || code.pending) break;
      code.confirmation = action.slice(3);
      renderCodeCard(code, 'qr-confirm');
      break;
    }
    case 'qr-cancel': {
      const code = state.codes.find(item => item.type === key);
      if (!code?.confirmation) break;
      const previous = 'qr-' + code.confirmation;
      code.confirmation = '';
      renderCodeCard(code, previous);
      break;
    }
    case 'qr-confirm':
    case 'qr-enable':
    case 'qr-retry': {
      const code = state.codes.find(item => item.type === key);
      if (!code) break;
      const operation = action === 'qr-confirm' ? code.confirmation : action === 'qr-retry' ? code.retryOperation : 'enable';
      if (operation) void updateCode(code, operation);
      break;
    }
    case 'change-tab':
      if (state.tab !== key) selectTab(key);
      break;
    case 'teacher-students':
      selectTab('students', key);
      break;
    case 'clear-filters':
      resetFilters();
      state.recordsLoading = true;
      renderWorkspace();
      document.querySelector('#record-search')?.focus();
      void loadRecords();
      break;
    case 'close-editor':
      closeEditor();
      break;
    case 'editor-page-options':
    case 'editor-retry-options':
      if (editor?.options && !editor.saving) void loadEditorOptions(editor, Number(key) || editor.options.page?.page || 1);
      break;
    case 'logout':
      void logout(button);
      break;
  }
});

document.addEventListener('input', event => {
  if (event.target.hasAttribute('data-editor-option-search') && editor?.options && !editor.saving) {
    const operation = editor;
    const options = operation.options;
    options.search = event.target.value.trim();
    options.version = (options.version || 0) + 1;
    options.loading = true;
    clearTimeout(options.timer);
    options.timer = setTimeout(() => {
      if (editor === operation) void loadEditorOptions(operation, 1);
    }, 220);
  }
  if (event.target.id === 'record-search') {
    state.search = event.target.value;
    clearStudentSelection();
    recordsVersion++;
    state.recordsLoading = true;
    renderRecords();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadRecords(), 220);
  }
});

document.addEventListener('change', event => {
  if (event.target.name === 'organizationIds' && editor?.entity === 'account') {
    const organizations = editor.organizations;
    if (event.target.checked) organizations.add(event.target.value);
    else organizations.delete(event.target.value);
    updateOrganizationSelectionCount();
  }
  if (event.target.matches('#editor-form input[type="checkbox"]')) {
    updateEditorSelectionControls();
  }
  if (event.target.id === 'code-version') {
    if (state.codes.some(code => code.pending && code.pending !== 'ensure')) {
      event.target.value = state.codeVersion;
      showToast('登记码正在更新，请稍后切换版本。');
      return;
    }
    state.codeVersion = event.target.value;
    codesVersion++;
    state.codes = state.codes.map(({ type, enabled, configured }) => ({ type, enabled, configured }));
    state.codes.forEach(code => renderCodeCard(code));
    void refreshCodeImages();
    return;
  }
  if (event.target.id === 'status-filter') {
    state.status = event.target.value;
    const teacherFilter = document.querySelector('#teacher-filter');
    if (teacherFilter) {
      teacherFilter.disabled = state.status === 'archived';
      if (teacherFilter.disabled) state.teacherFilter = teacherFilter.value = '';
    }
    clearStudentSelection();
    clearTimeout(searchTimer);
    void loadRecords();
  }
  if (event.target.id === 'teacher-filter') {
    state.teacherFilter = event.target.value;
    clearStudentSelection();
    clearTimeout(searchTimer);
    void loadRecords();
  }
  const id = event.target.dataset.studentChoice;
  if (id) {
    const student = state.records.find(item => item.id === id && item.active !== false);
    if (event.target.checked && student) state.selectedStudents.set(id, student);
    else state.selectedStudents.delete(id);
    updateStudentSelectionControls();
  }
  if (event.target.matches('#editor-form select[name="decision"]')) {
    const target = dialog.querySelector('[data-review-target]');
    if (!target) return;
    const showTarget = event.target.value === 'approve';
    const picker = target.querySelector('select');
    target.hidden = !showTarget;
    picker.required = showTarget && picker.name === 'studentId';
    picker.disabled = !showTarget;
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.directoryOpen && !dialog.open) {
    event.preventDefault();
    setDirectoryOpen(false, true);
  }
});

document.addEventListener('submit', event => {
  if (event.target.matches('#login-form')) {
    event.preventDefault();
    void submitLogin(event.target);
  } else if (event.target.matches('#editor-form')) {
    event.preventDefault();
    void saveEditor(event.target);
  }
});

void restoreSession();
