import afterSchoolArtwork from './after-school.webp';
import { ADMIN_MENUS, INSTITUTION_ADMIN_MENUS, adminMenuKeys, canAccessAdminMenu } from './admin-menus.js';

const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => escaped[character]);
}

export const entityNames = { organization: '机构', teacher: '教师', student: '学生', parent: '家长', account: '后台账号' };
const h = escapeHtml;

function mark() {
  return '<span class="brand-mark" aria-hidden="true"><i></i></span>';
}

function dataAction(action, key) {
  return `data-action="${h(action)}"${key == null ? '' : ` data-key="${h(key)}"`}`;
}

function action(label, name, { key, style = 'button', ariaLabel } = {}) {
  return `<button type="button" class="${style}" ${dataAction(name, key)}${ariaLabel ? ` aria-label="${h(ariaLabel)}"` : ''}>${h(label)}</button>`;
}

function addButton(entity) {
  return `<button type="button" class="button button-primary" ${dataAction('add', entity)}><span class="plus" aria-hidden="true">+</span>新增${entityNames[entity]}</button>`;
}

export function waitingView() {
  return `<main class="connecting"><div>${mark()}<p role="status">正在连接管理服务</p></div></main>`;
}

export function loginView(message = '') {
  return `<main class="login">
    <section class="login-brand" aria-label="托管管理后台">
      <div class="login-wordmark">${mark()}<strong>托管管理后台</strong></div>
      <div class="login-headline">
        <h1>机构管理</h1>
        <p>管理机构、老师和学生资料。</p>
      </div>
      <div class="login-orbit" aria-hidden="true"></div>
      <img class="login-illustration" alt="" src="${afterSchoolArtwork}" width="520" height="509">
    </section>
    <section class="login-content" aria-labelledby="login-title">
      <form id="login-form" class="login-form" method="post">
        <h2 id="login-title">管理员登录</h2>
        <label class="field"><span>管理员账号</span><input name="username" autocomplete="username" required></label>
        <label class="field"><span>密码</span><input type="password" name="password" autocomplete="current-password" required></label>
        <p class="form-error" role="alert"${message ? '' : ' hidden'}>${h(message)}</p>
        <button type="submit" class="button button-primary login-submit">登录 <span class="button-arrow" aria-hidden="true">→</span></button>
      </form>
    </section>
  </main>`;
}

function note(title, description = '', button = '') {
  return `<div class="notice" role="status"><h3>${h(title)}</h3>
    ${description ? `<p>${h(description)}</p>` : ''}
    ${button}
  </div>`;
}

function pagination(result, label, target, compact = false) {
  if (!result?.total) return '';
  const { page, pageSize, total, hasMore } = result;
  const pageCount = Math.ceil(total / pageSize);
  if (compact && pageCount <= 1) return '';
  return `<nav class="table-footer list-pagination${compact ? ' list-pagination--compact' : ''}" aria-label="${h(label)}分页">
    <span aria-live="polite">第 ${h(page)} / ${h(pageCount)} 页 · 共 ${h(total)} 条</span>
    ${pageCount > 1 ? `<span class="pagination-controls">
      <button type="button" class="button button-outline" ${dataAction(target, page - 1)}${page === 1 ? ' disabled' : ''}>上一页</button>
      <button type="button" class="button button-outline" ${dataAction(target, page + 1)}${hasMore ? '' : ' disabled'}>下一页</button>
    </span>` : ''}
  </nav>`;
}

function sidebar(state, organization, menus) {
  const platform = state.session?.role === 'platform';
  const organizationName = organization?.name || state.organizationId || '选择机构';
  const items = state.organizations.map(item => `
    <button type="button" class="organization-option${item.id === state.organizationId ? ' is-current' : ''}"
      ${dataAction('select-organization', item.id)}${item.id === state.organizationId ? ' aria-current="true"' : ''}>
      <span class="organization-symbol" aria-hidden="true">${h(Array.from(item.name || '机')[0])}</span>
      <span class="organization-option-text"><strong>${h(item.name)}</strong><small>${h(item.id)}</small></span>
      <span class="organization-arrow" aria-hidden="true">›</span>
    </button>`).join('');
  return `<aside class="sidebar">
    <div class="sidebar-top">
      <div class="brand">${mark()}<strong>托管管理后台</strong></div>
      ${menus.length ? `<nav class="sidebar-menu" aria-label="后台菜单">
        ${menus.map(({ key, label }) => `<button type="button" class="sidebar-nav-button" data-action="open-${key}"${state.section === (key === 'personnel' ? 'organizations' : key) ? ' aria-current="page"' : ''}>${h(label)}</button>`).join('')}
      </nav>` : ''}
    </div>
    <div class="sidebar-footer">
      <div class="organization-switcher">
        <button type="button" class="directory-toggle" data-action="toggle-directory" aria-controls="directory" aria-expanded="${state.directoryOpen}"
          aria-label="切换机构${state.organizationId ? '，当前为' + h(organizationName) : ''}" title="${h(organizationName)}">
          <span class="organization-symbol" aria-hidden="true">${h(Array.from(organization?.name || '机')[0])}</span>
          <span class="directory-current"><small>${state.organizationId ? '当前机构' : '机构'}</small><strong>${h(organizationName)}</strong></span>
          <span class="directory-chevron" aria-hidden="true"></span>
        </button>
        <div id="directory" class="directory"${state.directoryOpen ? '' : ' hidden'}>
          <div class="directory-heading"><h2 tabindex="-1">机构列表</h2>
            ${platform ? `<button type="button" class="small-add" ${dataAction('add', 'organization')} aria-label="新增机构">+</button>` : ''}
          </div>
          <nav class="organization-nav" aria-label="切换机构">
            ${state.organizationsError ? `<p class="directory-empty" role="status">${h(state.organizationsError)}</p>` :
              state.loadingOrganizations ? '<p class="directory-empty" role="status">正在加载机构</p>' :
              items || '<p class="directory-empty">暂无机构</p>'}
          </nav>
          ${state.organizationsError ? action('重新加载', 'retry-directory', { style: 'button button-outline' }) :
            pagination(state.organizationsPage, '机构', 'page-organizations', true)}
        </div>
      </div>
      <div class="sidebar-account">
        <div class="account-initial" aria-hidden="true">${h(Array.from(state.session?.username || '管')[0].toUpperCase())}</div>
        <div><strong>${h(state.session?.username)}</strong><small>${platform ? '平台管理员' : '机构管理员'}</small></div>
        ${action('退出登录', 'logout', { style: 'sidebar-logout' })}
      </div>
      ${platform ? `<button type="button" class="sidebar-nav-button account-nav" data-action="open-accounts"${state.section === 'accounts' ? ' aria-current="page"' : ''}>后台账号</button>` : ''}
    </div>
  </aside>`;
}

function option(value, label, selected) {
  return `<option value="${h(value)}"${selected ? ' selected' : ''}>${h(label)}</option>`;
}

function teacherLabel(teacher) {
  return teacher.name || '未命名老师';
}

function organizationBody(state) {
  if (state.loadingOrganizations && !state.organizationId) return note('正在加载机构');
  if (state.organizationsError && !state.organizationId) {
    return note('加载机构失败', state.organizationsError, action('重新加载', 'reload-organizations'));
  }
  if (!state.organizationId) {
    if (state.session.role !== 'platform') return note('暂无已授权机构', '请联系平台管理员分配机构。');
    return `<section class="empty-workspace">${mark()}
      <h1>新建一个机构</h1><p>创建机构后即可添加老师和学生。</p>${addButton('organization')}</section>`;
  }
  if (state.loadingOrganization) {
    return note('正在读取机构资料');
  }
  if (state.organizationError || !state.detail) {
    return note('加载机构资料失败', state.organizationError, action('重新加载', 'reload-organization'));
  }

  const { organization, teachers, counts } = state.detail;
  const tabName = state.tab === 'teachers' ? '教师' : '学生';
  const recordTab = state.tab === 'teachers' || state.tab === 'students';
  const tabs = [
    ['teachers', '教师', counts.teachers], ['students', '学生', counts.students], ['parents', '家长', counts.parents],
    ['requests', '审核', counts.requests],
  ];
  return `<section class="organization-heading" aria-labelledby="organization-title">
    <div>
      <h1 id="organization-title">${h(organization.name)}</h1>
      <dl class="org-meta">
        <div><dt>机构标识</dt><dd class="identifier">${h(organization.id)}</dd></div>
        <div><dt>待分配学生</dt><dd>${h(counts.unassigned)} 人</dd></div>
      </dl>
    </div>
    <div class="management-actions">
      ${action('编辑机构', 'edit-organization', { style: 'button button-outline' })}
      ${state.session.role === 'platform' ? action('删除机构', 'delete-organization', { style: 'button button-outline organization-delete' }) : ''}
    </div>
  </section>
  ${enrollmentPanel(state)}
  <section class="records" aria-label="机构人员管理">
    <div class="records-top">
      <nav class="record-tabs management-tabs" aria-label="机构业务">
        ${tabs.map(([key, label, count]) => `<button type="button" ${dataAction('change-tab', key)} aria-pressed="${state.tab === key}">${label}${count == null ? '' : ` <span>${count}</span>`}</button>`).join('')}
      </nav>
      ${state.tab === 'students' ? `<div class="management-actions">
        <button type="button" class="button button-outline" data-action="assign-selected"${state.selectedStudents.size ? '' : ' disabled'}>${assignmentButtonLabel(state.selectedStudents.size)}</button>
        ${addButton('student')}
      </div>` : state.tab === 'teachers' ? addButton('teacher') : ''}
    </div>
    ${recordTab ? `<div class="filters">
      <label class="search"><span class="search-icon" aria-hidden="true"></span><span class="sr-only">搜索${tabName}</span>
        <input id="record-search" type="search" value="${h(state.search)}"
          placeholder="${state.tab === 'teachers' ? '搜索教师姓名或电话' : '搜索学生、学校、家长姓名、关系或电话'}" maxlength="120" autocomplete="off">
      </label>
      <div class="select-filters">
        <label><span class="sr-only">状态</span><select id="status-filter">
          ${option('all', '全部在册', state.status === 'all')}
          ${option('active', '启用', state.status === 'active')}
          ${option('inactive', '停用', state.status === 'inactive')}
          ${state.tab === 'teachers' ? option('unbound', '待绑定', state.status === 'unbound') : ''}
          ${option('archived', '已删除', state.status === 'archived')}
        </select></label>
        ${state.tab === 'students' ? `<label><span class="sr-only">归属老师</span><select id="teacher-filter"${state.status === 'archived' ? ' disabled' : ''}>
          ${option('', '全部老师', !state.teacherFilter)}
          ${option('unassigned', '未分配老师', state.teacherFilter === 'unassigned')}
          ${teachers.filter(teacher => !['archived', 'unbound'].includes(teacher.status)).map(teacher => option(teacher.openid,
            teacherLabel(teacher) + (teacher.active === false ? '（停用）' : ''), state.teacherFilter === teacher.openid)).join('')}
        </select></label>` : ''}
      </div>
    </div>` : ''}
    ${state.tab === 'students' ? `<div class="records-selection" role="group" aria-label="学生选择">
      <button type="button" class="text-button" data-action="select-page-students" disabled>全选本页</button>
      <button type="button" class="text-button" data-action="clear-selected-students" disabled>取消全选</button>
    </div>` : ''}
    <div id="records-list">${recordsList(state)}</div>
  </section>`;
}

export function workspaceView(state) {
  const organization = state.detail?.organization ?? state.currentOrganization;
  const menus = ADMIN_MENUS.filter(({ key }) => canAccessAdminMenu(state.session, key));
  const activeMenu = menus.find(({ key }) => (key === 'personnel' ? 'organizations' : key) === state.section);
  const showingAccounts = state.section === 'accounts';
  const sectionName = showingAccounts ? '平台管理' : activeMenu?.label || '工作台';
  let body = note('暂无可用菜单', '请联系平台管理员分配菜单权限。');
  if (showingAccounts) body = accountsBody(state);
  else if (activeMenu?.key === 'personnel') body = organizationBody(state);
  else if (activeMenu) {
    if (state.organizationId || activeMenu.key === 'tools') body = `<div id="${activeMenu.key}-slot"></div>`;
    else if (state.loadingOrganizations) body = note('正在读取机构');
    else if (state.organizationsError) body = note('加载机构失败', state.organizationsError, action('重试', 'reload-organizations'));
    else body = note('暂无已授权机构', '获得机构授权后即可进入管理。');
  }
  return `<div class="workspace">
    ${sidebar(state, organization, menus)}
    <main class="main" id="main">
      <header class="breadcrumb" aria-label="当前位置">
        <span>${sectionName}</span>
        ${showingAccounts ? '<span class="breadcrumb-chevron" aria-hidden="true">›</span><strong>后台账号</strong>'
          : organization ? `<span class="breadcrumb-chevron" aria-hidden="true">›</span><strong>${h(organization.name)}</strong>` : ''}
      </header>
      ${body}
    </main>
  </div>`;
}

function status(active) {
  return statusLabel(active ? '启用' : '停用', active);
}

function statusLabel(label, active) {
  return `<span class="status${active ? '' : ' status-inactive'}"><i aria-hidden="true"></i>${h(label)}</span>`;
}

const requestStatuses = { pending: '待审核', approved: '已审核', active: '已办理', rejected: '已拒绝' };
const teacherStatuses = { active: '启用', disabled: '停用' };

function deleteAction(kind, key, name) {
  return action('删除', `delete-${kind}`, { key, style: 'text-button text-button-danger', ariaLabel: `删除${entityNames[kind]} ${name}` });
}

function personActions(kind, key, name, archived, extra = '') {
  if (archived) return '—';
  return `<div class="row-actions">${action('编辑', `edit-${kind}`, { key, style: 'text-button' })}${extra}${deleteAction(kind, key, name)}</div>`;
}

export function canSetTeacherPermissions(teacher, session) {
  return teacher && teacher.status !== 'archived' && (teacher.status === 'active'
    || teacher.canReviewEnrollment === true
    || (teacher.canManageFinance === true && canAccessAdminMenu(session, 'finance'))
    || (teacher.canManageMealExpenses === true && canAccessAdminMenu(session, 'meals')));
}

function teacherTable(records, session) {
  return `<table class="records-table teacher-table">
    <thead><tr><th scope="col">老师</th><th scope="col">联系电话</th><th scope="col">状态</th><th scope="col">启用学生</th><th scope="col">操作</th></tr></thead>
    <tbody>${records.map(teacher => `<tr>
      <td data-label="老师"><div class="row-person"><div class="person-mark" aria-hidden="true">${h(Array.from(teacherLabel(teacher))[0])}</div>
        <div><strong>${h(teacherLabel(teacher))}</strong></div></div></td>
      <td data-label="联系电话">${h(teacher.phone || '—')}</td>
      <td data-label="状态">${teacher.status === 'archived' ? statusLabel('已删除', false)
        : teacher.status === 'unbound' ? statusLabel('待绑定', false) : status(teacher.active !== false)}</td>
      <td data-label="启用学生">${['archived', 'unbound'].includes(teacher.status) ? '—' : action(`${teacher.studentCount ?? 0} 人`, 'teacher-students', { key: teacher.openid, style: 'text-button' })}</td>
      <td data-label="操作">${personActions('teacher', teacher.openid, teacherLabel(teacher), teacher.status === 'archived',
        canSetTeacherPermissions(teacher, session)
          ? action('权限设置', 'teacher-permissions', { key: teacher.openid, style: 'text-button' }) : '')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

export function assignmentButtonLabel(count) {
  return count ? `批量分配（${count}）` : '批量分配';
}

function distinctRecordPhones(student) {
  const bound = student.boundParentContacts ?? [];
  const boundPhones = new Set(bound.flatMap(({ contact1, contact2 }) => [contact1, contact2]));
  return bound.length ? [...new Set([student.contact1, student.contact2])]
    .filter(phone => phone && !boundPhones.has(phone)) : [];
}

function studentContacts(student) {
  const bound = student.boundParentContacts ?? [];
  const contacts = bound.length ? bound : [student];
  const recordPhones = distinctRecordPhones(student);
  return `<div class="student-contacts"><ul class="student-contact-list">${contacts.map(contact => `<li>
    <strong>${h(contact.guardianName || '—')}</strong>
    <small>与孩子关系 · ${h(contact.relationship || '—')}</small>
    ${!contact.guardianName && contact.guardian ? `<small>历史称呼 · ${h(contact.guardian)}</small>` : ''}
    ${contact.contact1 ? `<small>${h(contact.contact1)}</small>` : ''}${contact.contact2 ? `<small>${h(contact.contact2)}</small>` : ''}
  </li>`).join('')}</ul>
  ${recordPhones.length ? `<div class="student-record-contact"><small>档案联系方式</small>
    ${recordPhones.map(phone => `<small>${h(phone)}</small>`).join('')}</div>` : ''}
  <small>已绑定 ${h(student.boundParentCount ?? 0)} 人</small></div>`;
}

function studentTable(records, teachers, selected, canViewFinance) {
  const teachersById = new Map(teachers.map(item => [item.openid, item]));
  return `<table class="records-table student-table">
    <thead><tr><th scope="col">学生</th><th scope="col">学校与年级</th><th scope="col">归属老师</th><th scope="col">家长联系</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
    <tbody>${records.map(student => {
      const teacher = teachersById.get(student.teacherOpenid);
      const homework = action('作业情况', 'student-homework', { key: student.id, style: 'text-button' });
      const finance = canViewFinance ? action('缴费记录', 'student-finance-history', { key: student.id, style: 'text-button' }) : '';
      return `<tr>
        <td data-label="学生"><div class="row-person">
          ${student.active === false ? '' : `<label class="student-select"><input type="checkbox" data-student-choice="${h(student.id)}"${selected.has(student.id) ? ' checked' : ''}><span class="sr-only">选择${h(student.name)}</span></label>`}
          <div class="person-mark" aria-hidden="true">${h(Array.from(student.name || '学')[0])}</div>
          <div><strong>${h(student.name)}</strong>${student.age != null && student.age !== '' ? `<small>${h(student.age)} 岁</small>` : ''}</div></div></td>
        <td data-label="学校与年级"><div>${h(student.school || '—')}${student.grade ? `<small>${h(student.grade)}</small>` : ''}</div></td>
        <td data-label="归属老师"><div>${student.teacherOpenid && teacher?.active !== false
          ? `<strong>${h(teacher ? teacherLabel(teacher) : student.teacherName || '教师')}</strong><small>已分配</small>`
          : statusLabel('待分配', false)}</div></td>
        <td data-label="家长联系">${studentContacts(student)}</td>
        <td data-label="状态">${student.status === 'archived' ? statusLabel('已删除', false) : status(student.active !== false)}</td>
        <td data-label="操作">${student.status === 'archived' ? `<div class="row-actions">${homework}${finance}</div>`
          : personActions('student', student.id, student.name, false, homework + finance)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function recordsList(state) {
  if (state.recordsLoading) return note('正在读取记录');
  if (state.recordsError) return note('加载记录失败', state.recordsError,
    action('重新加载', 'reload-records', { style: 'button button-outline' }));
  const records = state.records;
  const pager = pagination(state.recordsPage, '机构记录', 'page-records');
  if (state.tab === 'parents') return parentTable(records) + pager;
  if (state.tab === 'requests') return requestTable(records) + pager;
  const archiveMode = state.status === 'archived';
  const teacherMode = state.tab === 'teachers';
  if (!records.length) {
    const filtered = state.search.trim() || state.teacherFilter || (!archiveMode && state.status !== 'all');
    const title = filtered ? '没有符合条件的记录' : `暂无${archiveMode ? '已删除的' : ''}${teacherMode ? '教师' : '学生'}`;
    return note(title, '', filtered
      ? action('清除筛选', 'clear-filters', { style: 'button button-outline' })
      : '');
  }
  return `<div class="table-wrap">${teacherMode
    ? teacherTable(records, state.session)
    : studentTable(records, state.detail.teachers, state.selectedStudents, canAccessAdminMenu(state.session, 'finance'))}</div>${pager}`;
}

function table(headings, rows) {
  return `<div class="table-wrap"><table class="records-table management-table"><thead><tr>${headings.map(heading =>
    `<th scope="col">${h(heading)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function cell(label, content) {
  return `<td data-label="${h(label)}"><div>${content}</div></td>`;
}

function parentTable(parents) {
  if (!parents.length) return note('暂无家长');
  return table(['家长姓名', '联系电话', '已绑定孩子', '操作'], parents.map(parent => `<tr>
    ${cell('家长姓名', `<strong>${h(parent.guardianName || '—')}</strong>`)}
    ${cell('联系电话', h([parent.contact1, parent.contact2].filter(Boolean).join(' / ') || '—'))}
    ${cell('已绑定孩子', parent.students?.length ? `<ul class="relation-list">${parent.students.map(student => `<li>
      <span>${h(student.name)} · ${h(student.relationship || '—')}</span><button type="button" class="text-button" data-action="unlink-parent"
        data-parent-id="${h(parent.id)}" data-key="${h(student.id)}" aria-label="解除和${h(student.name)}的绑定">解绑</button></li>`).join('')}</ul>` : '未绑定孩子')}
    ${cell('操作', deleteAction('parent', parent.id, parent.guardianName || '未命名家长'))}
  </tr>`));
}

function requestTable(requests) {
  if (!requests.length) return note('暂无登记申请');
  const ordered = [...requests].sort((left, right) => Number(right.status === 'pending') - Number(left.status === 'pending'));
  return table(['类型', '申请资料', '状态', '操作'], ordered.map(item => {
    const title = item.type === 'teacher' ? item.teacher?.name : item.student?.name;
    const information = item.type === 'teacher' ? item.teacher?.phone : [item.student?.school, item.student?.grade].filter(Boolean).join(' · ');
    const guardian = item.type === 'teacher' ? '' : `<small>家长 ${h(item.parent?.guardianName || '—')} · ${h(item.parent?.relationship || '—')}</small>`;
    return `<tr>
      ${cell('类型', item.type === 'teacher' ? '教师注册' : '家长绑定')}
      ${cell('申请资料', `<strong>${h(title || '—')}</strong>${information ? `<small>${h(information)}</small>` : ''}${guardian}`)}
      ${cell('状态', statusLabel(requestStatuses[item.status] || item.status, item.status === 'active'))}
      ${cell('操作', item.status === 'pending' || item.status === 'approved'
        ? action(item.status === 'approved' ? '重新审核' : '审核', 'review-request', { key: item.id, style: 'text-button' }) : '—')}
    </tr>`;
  }));
}

const codeLabels = { teacher: '教师登记码', parent: '家长登记码' };
const codeVersions = { release: '正式版', trial: '体验版', develop: '开发版' };

export function enrollmentCodeLabels(type, state) {
  const title = codeLabels[type];
  const local = state.codeGenerationMode === 'local';
  const subtitle = local ? '本机联调' : state.codeVersion === 'release' ? '' : codeVersions[state.codeVersion];
  const imageLabel = local ? title.replace('登记码', '联调登记码') : title;
  const fileName = !local && subtitle ? `${imageLabel}（${subtitle}）` : imageLabel;
  return { title, subtitle, imageLabel, fileName };
}

export function enrollmentCodeCard(code, state) {
  const { type, configured, enabled, pending, error, confirmation, downloading } = code;
  const { title, imageLabel } = enrollmentCodeLabels(type, state);
  const offline = !state.codeGenerationAvailable;
  const image = !pending && enabled && code.imageUrl;
  const stopped = configured && !enabled;
  const message = pending ? (pending === 'disable' ? '正在停用' : '正在生成二维码')
    : stopped ? '登记码已停用' : error ? '二维码暂未生成' : offline ? '暂无可用二维码' : '正在准备二维码';
  const codeStatus = pending ? '处理中' : enabled ? '启用' : stopped ? '停用' : '未生成';
  const buttons = [
    error ? action('重试', 'qr-retry', { key: type, style: 'button button-outline' }) : '',
    enabled && !offline ? action('更换', 'qr-rotate', { key: type, style: 'button button-outline' }) : '',
    enabled ? action('停用', 'qr-disable', { key: type, style: 'button button-outline' }) : '',
    stopped && !offline && !error ? action('恢复使用', 'qr-enable', { key: type, style: 'button button-outline' }) : '',
  ];
  return `<article class="code-card" data-code-card="${h(type)}" aria-labelledby="code-title-${h(type)}" tabindex="-1">
    <header><h3 id="code-title-${h(type)}">${title}</h3>${statusLabel(codeStatus, enabled && !pending)}</header>
    <p class="code-description">${type === 'teacher' ? '老师扫码提交姓名和电话，后台审核后开通。' : '家长扫码填写孩子资料，按登记情况核对档案。'}</p>
    <div class="code-preview" aria-busy="${Boolean(pending)}">
      ${image ? `<img src="${h(image)}" alt="${h(imageLabel)}" width="208" height="208">` : `<span role="status">${message}</span>`}
    </div>
    ${error ? `<p class="code-error" role="alert">${h(error)}</p>` : ''}
    ${image ? `<div class="code-downloads" aria-busy="${Boolean(downloading)}">
      <button type="button" class="button button-primary code-download" ${dataAction('qr-download-image', type)}${downloading ? ' aria-disabled="true"' : ''}>
        ${downloading === 'image' ? '正在生成图片' : '下载图片'}
      </button>
      <button type="button" class="button button-outline code-download" ${dataAction('qr-download-pdf', type)}${downloading ? ' aria-disabled="true"' : ''}>
        ${downloading === 'pdf' ? '正在生成 PDF' : '下载 PDF'}
      </button>
    </div>` : ''}
    ${!pending && buttons.some(Boolean) ? `<div class="management-actions code-actions">${buttons.join('')}</div>` : ''}
    ${confirmation ? `<div class="code-confirmation">
      <p>${confirmation === 'rotate' ? '更换后，原登记码将失效。已提交的申请仍可办理。' : '停用后将暂停通过这个二维码登记。'}</p>
      <div class="management-actions">
        ${action('取消', 'qr-cancel', { key: type, style: 'button button-outline' })}
        ${action(confirmation === 'rotate' ? '确认更换' : '确认停用', 'qr-confirm', { key: type, style: 'button button-primary' })}
      </div>
    </div>` : ''}
  </article>`;
}

function enrollmentPanel(state) {
  return `<section class="enrollment-panel" aria-labelledby="organization-codes-title">
    <h2 id="organization-codes-title">
      <button type="button" class="enrollment-toggle" data-action="toggle-codes"
        aria-expanded="${state.codesOpen}" aria-controls="organization-codes-body">
        登记码<span class="enrollment-chevron" aria-hidden="true"></span>
      </button>
    </h2>
    <div id="organization-codes-body"${state.codesOpen ? '' : ' hidden'}>${state.codesOpen ? codesView(state) : ''}</div>
  </section>`;
}

export function codesView(state) {
  if (state.codesError) return note('加载登记码失败', state.codesError, action('重新加载', 'reload-codes', { style: 'button button-outline' }));
  if (state.codesLoading || !state.codesLoaded) return note('正在读取登记码');
  const offline = !state.codeGenerationAvailable;
  const local = state.codeGenerationMode === 'local';
  return `${offline ? `<div class="code-notice" role="status"><strong>当前后台未连接微信发码</strong>
    <p>微信小程序码需要从已配置微信服务的后台生成。</p></div>` : local ?
    `<div class="code-notice" role="status"><strong>本机联调登记码</strong>
      <p>先用微信扫一扫打开「本地真机联调」的调试码，再在小程序里点「扫描机构二维码」，扫描下方登记码。</p></div>` :
    `<div class="code-version">
      <p id="code-version-hint">用微信扫一扫打开小程序。正式版发布后可对外登记，体验版和开发版用于联调。</p>
      <label><span>小程序版本</span><select id="code-version" aria-describedby="code-version-hint">
        ${Object.entries(codeVersions).map(([key, label]) => option(key, label, state.codeVersion === key)).join('')}
      </select></label>
    </div>`}
    <div class="code-grid">${Object.keys(codeLabels).map(type =>
      enrollmentCodeCard(state.codes.find(item => item.type === type) || { type }, state)).join('')}</div>`;
}

function allowedAccountMenus(item) {
  const menuKeys = adminMenuKeys(item);
  return INSTITUTION_ADMIN_MENUS.filter(({ key }) => menuKeys.includes(key));
}

function accountsBody(state) {
  const names = state.organizationNames;
  let content = note('暂无机构管理员账号');
  if (state.accountsLoading) content = note('正在读取后台账号');
  else if (state.accountsError) content = note('加载后台账号失败', state.accountsError, action('重新加载', 'open-accounts', { style: 'button button-outline' }));
  else if (state.accounts.length) content = table(['账号', '机构权限', '菜单权限', '状态', '操作'], state.accounts.map(item => `<tr>
    ${cell('账号', `<strong>${h(item.username)}</strong>`)}
    ${cell('机构权限', h(item.organizationIds.map(id => Object.hasOwn(names, id) ? names[id] : id).join('、') || '—'))}
    ${cell('菜单权限', allowedAccountMenus(item).map(({ label }) => `<span class="account-menu-tag">${h(label)}</span>`).join(' ') || '未授权')}
    ${cell('状态', status(item.active !== false))}
    ${cell('操作', action('编辑', 'edit-account', { key: item.username, style: 'text-button' }))}
  </tr>`));
  return `<section class="organization-heading" aria-labelledby="account-title"><div><h1 id="account-title">后台账号</h1>
    <p>创建机构管理员账号，设置可管理的机构和可使用的菜单。</p></div>${addButton('account')}</section>
    <section class="records account-records" aria-label="机构管理员账号">${content}
      ${state.accountsLoading || state.accountsError ? '' : pagination(state.accountsPage, '后台账号', 'page-accounts')}</section>`;
}

function field(name, label, value = '', options = {}) {
  const { type = 'text', required, readonly, minlength, maxlength = 100, min, max, placeholder, className = '' } = options;
  return `<label class="field ${className}"><span>${h(label)}${required ? ' <span class="required" aria-hidden="true">*</span>' : ''}</span>
    <input type="${type}" name="${h(name)}" value="${h(value)}" autocomplete="${type === 'password' ? 'new-password' : 'off'}"
      ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} ${minlength == null ? '' : `minlength="${minlength}"`}
      ${max == null ? '' : `max="${max}"`} ${min == null ? '' : `min="${min}"`}
      ${placeholder ? `placeholder="${h(placeholder)}"` : ''}
      ${type === 'number' ? '' : `maxlength="${maxlength}"`}>
  </label>`;
}

function activeField(active, label = '账号状态') {
  return `<div class="activation">
    <label class="field"><span>${h(label)}</span><select name="active">
      ${option('true', '启用', active)}${option('false', '停用', !active)}
    </select></label>
  </div>`;
}

function teacherOptions(teachers, assignment) {
  return teachers.filter(teacher => teacher.active !== false).map(teacher =>
    option(teacher.openid, teacherLabel(teacher), assignment === teacher.openid)).join('');
}

function gradeField(value) {
  const grades = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三'];
  const current = String(value ?? '').normalize('NFKC').replace(/\s+/g, '');
  const number = /^([1-9一二三四五六七八九])(?:年级)?$/.exec(current);
  const middle = /^(?:初中|初)([123一二三])(?:年级)?$/.exec(current);
  const position = number?.[1] || middle?.[1];
  const digit = Number(position);
  const index = Number.isNaN(digit) ? '一二三四五六七八九'.indexOf(position) : digit - 1;
  const grade = position ? grades[index + (middle ? 6 : 0)] : current;
  return `<label class="field"><span>年级 <span class="required" aria-hidden="true">*</span></span>
    <select name="grade" required>
      <option value="" disabled${grades.includes(grade) ? '' : ' selected'}>${h(value && !grades.includes(grade) ? '请选择年级（原值 ' + value + '）' : '请选择年级')}</option>
      ${grades.map(entry => option(entry, entry, entry === grade)).join('')}
    </select>
  </label>`;
}

function guardianFields(contact, prefix = '') {
  const required = !prefix;
  return `<div class="form-grid">
    ${field(prefix + 'guardianName', '家长姓名', contact.guardianName, { required, maxlength: 30 })}
    ${field(prefix + 'relationship', '与孩子关系', contact.relationship, { required, maxlength: 20, placeholder: '如妈妈、爸爸、外婆' })}
    ${field(prefix + 'contact1', '联系电话 1', contact.contact1, { type: 'tel', maxlength: 32, required })}
    ${field(prefix + 'contact2', '联系电话 2', contact.contact2, { type: 'tel', maxlength: 32 })}
  </div>`;
}

function studentFields(item, detail, editing) {
  const { teachers } = detail;
  const assignment = editing ? item.teacherOpenid || '' : 'auto';
  const selected = teachers.find(teacher => teacher.openid === assignment);
  const bound = item.boundParentContacts ?? [];
  const recordPhones = distinctRecordPhones(item);
  return `<fieldset class="student-editor"><legend>学生资料</legend>
    <div class="form-grid">
      ${field('name', '学生姓名', item.name, { required: true, maxlength: 30 })}
      ${field('age', '年龄', item.age, { type: 'number', min: 0, max: 120, required: true })}
      ${field('school', '学校', item.school, { required: true, maxlength: 60 })}
      ${gradeField(item.grade)}
    </div>
  </fieldset>
  <fieldset class="student-editor"><legend>家长联系</legend>
    ${bound.length ? bound.map((contact, index) => `<fieldset><legend>${bound.length === 1 ? '已绑定家长' : '家长 ' + (index + 1)}</legend>
      ${!contact.guardianName && contact.guardian ? `<p class="editor-hint">历史称呼 · ${h(contact.guardian)}</p>` : ''}
      ${guardianFields(contact, 'bound' + index + '-')}</fieldset>`).join('') : guardianFields(item)}
    ${recordPhones.length ? `<p class="editor-hint">档案联系方式 · ${recordPhones.map(h).join('、')}</p>` : ''}
  </fieldset>
  <fieldset><legend>归属与状态</legend>
    ${editing ? '' : optionSearch('搜索老师')}
    <label class="field"><span>归属老师</span><select name="teacherOpenid">
      ${editing ? option('', '待分配', !assignment) : option('auto', '按机构规则自动分配', true)}
      ${selected ? teacherOptions([selected], assignment) : ''}
    </select></label>
    <div data-editor-option-pages></div>
    ${activeField(item.active !== false, '档案状态')}
  </fieldset>`;
}

export function accountOrganizationChoices(items, selected) {
  return items.map(organization => `<label class="choice-row">
    <input type="checkbox" name="organizationIds" value="${h(organization.id)}"${selected.has(organization.id) ? ' checked' : ''}>
    <span>${h(organization.name)}</span></label>`).join('');
}

export function editorOptionPages(optionState) {
  if (optionState.loading) return '<p class="editor-hint" role="status">正在读取选项</p>';
  if (optionState.error) return `<p class="editor-hint" role="status">${h(optionState.error)}</p>
    ${action('重新加载', 'editor-retry-options', { style: 'button button-outline' })}`;
  return pagination(optionState.page, '可选档案', 'editor-page-options', true);
}

function optionSearch(label) {
  return `<label class="field"><span class="sr-only">${label}</span>
    <input type="search" class="option-search" data-editor-option-search placeholder="${label}" maxlength="120" autocomplete="off">
  </label>`;
}

function editorSelectionActions(group, label, paginated = false) {
  return `<div class="editor-selection" role="group" aria-label="${h(label)}" data-editor-selection="${h(group)}">
    <button type="button" class="text-button" data-action="editor-select-all" disabled>${paginated ? '全选本页' : '全选'}</button>
    <button type="button" class="text-button" data-action="editor-clear-selection" disabled>取消全选</button>
  </div>`;
}

function accountFields(item, editing) {
  const allowedKeys = new Set(adminMenuKeys(item));
  return `${field('username', '登录账号', item.username, { required: true, readonly: editing, minlength: 3, maxlength: 64 })}
    ${field('password', editing ? '重置密码（选填）' : '初始密码', '', { type: 'password', required: !editing, minlength: 12, maxlength: 128 })}
    <fieldset class="permission-fields"><legend>菜单权限</legend>
      ${editorSelectionActions('menuKeys', '菜单权限选择')}
      ${INSTITUTION_ADMIN_MENUS.map(({ key, label }) => `<label class="choice-row">
        <input type="checkbox" name="menuKeys" value="${h(key)}"${allowedKeys.has(key) ? ' checked' : ''}>
        <span>${h(label)}</span></label>`).join('')}
    </fieldset>
    <fieldset><legend>授权机构</legend>
      <div class="account-selection-head">
        <p class="editor-hint" data-organization-selection-count aria-live="polite">已选 ${item.organizationIds?.length || 0} 家机构</p>
        ${editorSelectionActions('organizationIds', '授权机构选择', true)}
      </div>
      <div class="choice-list" data-account-organization-options></div>
      <div data-editor-option-pages></div>
    </fieldset>${activeField(item.active !== false)}`;
}

function requestFields(item, detail) {
  if (item.type === 'teacher') {
    const drafts = detail.teachers.filter(teacher => teacher.status === 'unbound');
    const applicant = item.teacher || {};
    const digits = value => String(value || '').replace(/\D/g, '');
    const matches = drafts.filter(teacher => teacher.name.trim() === applicant.name?.trim() && digits(teacher.phone) === digits(applicant.phone));
    const suggested = matches.length === 1 ? matches[0].openid : '';
    return `<dl class="review-facts"><div><dt>教师姓名</dt><dd>${h(applicant.name)}</dd></div>
      <div><dt>联系电话</dt><dd>${h(applicant.phone)}</dd></div></dl>
      <label class="field"><span>审核结果</span><select name="decision" required>${option('', '请选择', true)}
        ${option('approve', '通过并绑定微信')}${option('reject', '拒绝申请')}</select></label>
      <div data-review-target hidden>${optionSearch('搜索教师姓名或电话')}
      <label class="field"><span>关联教师档案</span><select name="teacherId" disabled>
        ${option('', '创建新教师档案', !suggested)}
        ${drafts.map(teacher => option(teacher.openid, [teacher.name, teacher.phone].filter(Boolean).join(' · '), suggested === teacher.openid)).join('')}
      </select></label><div data-editor-option-pages></div></div>`;
  }
  const { student = {}, parent = {}, candidates = [] } = item;
  const matched = new Set(candidates.map(item => item.id));
  const students = [...(detail.students || candidates)].filter(entry => entry.active !== false)
    .sort((left, right) => Number(matched.has(right.id)) - Number(matched.has(left.id)));
  return `<dl class="review-facts">
    <div><dt>学生</dt><dd>${h([student.name, student.age == null ? '' : `${student.age} 岁`, student.school, student.grade].filter(Boolean).join(' · '))}</dd></div>
    <div><dt>家长姓名</dt><dd>${h(parent.guardianName || '—')}</dd></div>
    <div><dt>与孩子关系</dt><dd>${h(parent.relationship || '—')}</dd></div>
    <div><dt>联系电话</dt><dd>${h([parent.contact1, parent.contact2].filter(Boolean).join(' · ') || '—')}</dd></div>
    <div><dt>可能重复</dt><dd>${candidates.map(candidate => h([candidate.name, candidate.school, candidate.grade].filter(Boolean).join(' · '))).join('、') || '暂无匹配档案'}</dd></div>
    </dl>
    <label class="field"><span>审核结果</span><select name="decision" required>${option('', '请选择', true)}
      ${option('approve', '绑定到已有档案')}${option('new', '核实为新生，创建并绑定')}${option('reject', '拒绝申请')}</select></label>
    <div data-review-target hidden>${optionSearch('搜索学生姓名或学校')}
    <label class="field"><span>目标学生</span><select name="studentId" disabled>${option('', '请选择学生', true)}
      ${students.map(entry => option(entry.id, [entry.name, entry.school, entry.grade, matched.has(entry.id) ? '可能匹配' : ''].filter(Boolean).join(' · '))).join('')}
    </select></label><div data-editor-option-pages></div></div>`;
}

export function editorView(editor, detail, session) {
  const { entity, original } = editor;
  let title = `${original ? '编辑' : '新增'}${entityNames[entity] || ''}`;
  let label = original ? '保存修改' : `新增${entityNames[entity] || ''}`;
  const item = original || {};
  let fields;
  if (entity === 'organization') {
    fields = `${field('name', '机构名称', item.name, { required: true, maxlength: 60 })}
      ${field('id', '机构标识', item.id, { required: !original, readonly: Boolean(original), maxlength: 64 })}`;
  } else if (entity === 'teacher') {
    const waitingForWechat = !original || item.status === 'unbound';
    fields = `${field('name', '老师姓名', item.name, { required: true, maxlength: 30 })}
      ${field('phone', '联系电话', item.phone, { type: 'tel', required: waitingForWechat, maxlength: 32 })}
      ${waitingForWechat ? '<p class="editor-hint">教师扫码登记后，在「审核」选择这份档案即可关联微信。</p>' :
        `<label class="field"><span>教师状态</span><select name="status">${Object.entries(teacherStatuses).map(([key, value]) => option(key, value, item.status === key)).join('')}</select></label>
         <p class="editor-hint">停用后，名下学生会转为待分配。</p>`}`;
  } else if (entity === 'account') {
    fields = accountFields(item, Boolean(original));
  } else if (entity === 'teacherPermissions') {
    title = '权限设置';
    const financeFields = canAccessAdminMenu(session, 'finance') ? `
      <label class="choice-row"><input type="checkbox" name="canManageFinance" value="true"
        aria-describedby="finance-permission-hint"${item.canManageFinance === true ? ' checked' : item.status === 'active' ? '' : ' disabled'}>
        <span>财务管理</span></label>
      <p class="editor-hint" id="finance-permission-hint">${item.status === 'active'
        ? '允许教师在小程序管理本机构的收费阶段、学生账单、收退款和财务总览。'
        : item.canManageFinance === true ? '教师已停用。可取消勾选撤回授权。' : '请先启用教师账号，再开通财务管理。'}</p>` : '';
    const mealExpenseFields = canAccessAdminMenu(session, 'meals') ? `
      <label class="choice-row"><input type="checkbox" name="canManageMealExpenses" value="true"
        aria-describedby="meal-expenses-permission-hint"${item.canManageMealExpenses === true ? ' checked' : item.status === 'active' ? '' : ' disabled'}>
        <span>餐食费用</span></label>
      <p class="editor-hint" id="meal-expenses-permission-hint">${item.status === 'active'
        ? '允许教师在小程序管理本机构的餐食支出和凭证。'
        : item.canManageMealExpenses === true ? '教师已停用。可取消勾选撤回授权。' : '请先启用教师账号，再开通餐食费用。'}</p>` : '';
    fields = `<fieldset class="permission-fields"><legend>${h(teacherLabel(item))}</legend>
      ${editorSelectionActions('teacherPermissions', '教师权限选择')}
      <label class="choice-row"><input type="checkbox" name="canReviewEnrollment" value="true"
        aria-describedby="enrollment-permission-hint"${item.canReviewEnrollment === true ? ' checked' : item.status === 'active' ? '' : ' disabled'}>
        <span>登记审核</span></label>
      <p class="editor-hint" id="enrollment-permission-hint">${item.status === 'active'
        ? '允许教师在小程序审核本机构的教师和家长登记申请。'
        : item.canReviewEnrollment === true ? '教师已停用。可取消勾选撤回授权。' : '请先启用教师账号，再开通登记审核。'}</p>${financeFields}${mealExpenseFields}
    </fieldset>`;
  } else if (entity === 'review') {
    title = item.type === 'teacher' ? '审核教师注册' : '审核家长绑定';
    label = '提交审核';
    fields = requestFields(item, detail);
  } else if (entity === 'assign') {
    title = `分配 ${item.students.length} 名学生`;
    label = '确认分配';
    fields = `<p class="editor-hint">${item.students.map(student => h(student.name)).join('、')}</p>
      ${optionSearch('搜索老师')}
      <label class="field"><span>负责老师</span><select name="teacherOpenid" required>${option('', '请选择启用的老师', true)}</select></label>
      <div data-editor-option-pages></div>`;
  } else if (entity === 'unlink') {
    title = '解除家长绑定';
    label = '确认解绑';
    fields = `<p class="editor-hint">解绑后，${h(item.guardianName || '该家长')}将失去访问${h(item.student.name)}资料的权限。其他孩子的绑定继续有效。</p>`;
  } else if (entity === 'delete') {
    title = `删除${entityNames[item.kind]}`;
    label = '确认删除';
    const consequences = {
      organization: '删除后，该机构将从列表移除，原登记码失效，教师、家长和机构管理员均失去访问权限。历史档案和作业记录会保留。',
      teacher: '教师将失去本机构的访问权限，名下学生转为待分配。历史作业和反馈保留。',
      student: '学生会从在册名单移除，老师和家长失去访问该孩子资料的权限。历史作业和反馈保留。',
      parent: `该家长在本机构的全部${item.childCount ? ` ${item.childCount} 条` : ''}孩子绑定都会解除。学生档案和其他家长的绑定保留。`,
    };
    fields = `<div class="delete-summary"><strong>${h(item.name)}</strong><p>${h(consequences[item.kind])}</p></div>`;
  } else {
    fields = studentFields(item, detail, Boolean(original));
  }
  return `<form id="editor-form" class="editor-form" method="post">
    <header class="editor-head"><div>
      <h2 id="editor-title">${h(title)}</h2>
      ${entity === 'organization' || entity === 'account' ? '' : `<p>${h(detail.organization.name)}</p>`}
    </div>
    <button type="button" class="editor-close" data-action="close-editor" aria-label="关闭">×</button></header>
    <div class="editor-body">${fields}</div>
    <footer class="editor-foot">
      <p class="form-error" role="alert" hidden></p>
      <div class="editor-actions">
        ${action('取消', 'close-editor', { style: 'button button-outline' })}
        <button type="submit" class="button ${entity === 'delete' ? 'button-danger' : 'button-primary'}">${h(label)}</button>
      </div>
    </footer>
  </form>`;
}
