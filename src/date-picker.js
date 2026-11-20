import './date-picker.css';

const dateFields = 'input[type="date"], input[type="month"]';
const monthNames = Array.from({ length: 12 }, (_, index) => index + 1);
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const shanghaiDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
const gridKeys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function pad(number, digits = 2) {
  return String(number).padStart(digits, '0');
}

function dateKey(date) {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) return '';
  return date.toISOString().slice(0, 10);
}

function moveDate(day, offset) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return dateKey(date);
}

function moveMonth(month, offset) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return dateKey(date).slice(0, 7);
}

function labelOf(value) {
  const [year, month, day] = value.split('-').map(Number);
  return year + '年' + month + '月' + (day ? day + '日' : '');
}

function calendarDays(month) {
  const first = month + '-01';
  const weekday = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => moveDate(first, index - weekday));
}

function isDateInput(target) {
  return target instanceof HTMLInputElement && target.matches(dateFields) && !target.matches(':disabled, [readonly]');
}

export function installDatePicker() {
  const popup = document.createElement('dialog');
  popup.className = 'date-picker-dialog';
  popup.id = 'admin-date-picker';
  popup.innerHTML = `<header class="date-picker-header">
    <h2></h2>
    <button type="button" class="date-picker-close" data-date-action="close" aria-label="关闭日期选择">×</button>
  </header>
  <div class="date-picker-content">
    <div class="date-picker-navigation">
      <button type="button" class="date-picker-arrow" data-date-action="previous"></button>
      <div class="date-picker-period" aria-label="显示年月">
        <label class="date-picker-year"><input type="text" inputmode="numeric" maxlength="4" aria-label="年份"><span aria-hidden="true">年</span></label>
        <select class="date-picker-month-select" aria-label="月份"></select>
      </div>
      <button type="button" class="date-picker-arrow" data-date-action="next"></button>
    </div>
    <p class="sr-only" id="date-picker-keyboard">方向键移动，按回车键选择。</p>
    <div class="date-picker-weekdays" aria-hidden="true">${weekdays.map(day => '<span>' + day + '</span>').join('')}</div>
    <div class="date-picker-grid" role="group" aria-describedby="date-picker-keyboard"></div>
  </div>
  <footer class="date-picker-footer">
    <button type="button" data-date-action="clear">清除</button>
    <span class="date-picker-selection"></span>
    <button type="button" data-date-action="today">今天</button>
  </footer>`;
  const title = popup.querySelector('h2');
  const yearInput = popup.querySelector('.date-picker-year input');
  const monthSelect = popup.querySelector('.date-picker-month-select');
  const weekdayRow = popup.querySelector('.date-picker-weekdays');
  const grid = popup.querySelector('.date-picker-grid');
  const previous = popup.querySelector('[data-date-action="previous"]');
  const next = popup.querySelector('[data-date-action="next"]');
  const clear = popup.querySelector('[data-date-action="clear"]');
  const todayButton = popup.querySelector('[data-date-action="today"]');
  const selection = popup.querySelector('.date-picker-selection');
  let state = null;

  function allowed(value) {
    return value && value >= state.min && value <= state.max;
  }

  function canShow(month) {
    if (!month || state.min > state.max) return false;
    const length = state.monthOnly ? 4 : 7;
    const period = month.slice(0, length);
    return period >= state.min.slice(0, length) && period <= state.max.slice(0, length);
  }

  function render(preferred = state.selected || state.today) {
    const { month, monthOnly, selected, today } = state;
    const year = month.slice(0, 4);
    const navStep = monthOnly ? 12 : 1;
    yearInput.value = Number(year);
    monthSelect.hidden = monthOnly;
    weekdayRow.hidden = monthOnly;
    grid.classList.toggle('date-picker-grid--months', monthOnly);
    grid.setAttribute('aria-label', monthOnly ? year + '年的月份' : labelOf(month) + '的日期');
    if (!monthOnly) {
      monthSelect.innerHTML = monthNames.map(item => {
        const period = year + '-' + pad(item);
        return `<option value="${period}"${canShow(period) ? '' : ' disabled'}>${item}月</option>`;
      }).join('');
      monthSelect.value = month;
    }
    previous.setAttribute('aria-label', monthOnly ? '上一年' : '上一月');
    next.setAttribute('aria-label', monthOnly ? '下一年' : '下一月');
    previous.disabled = !canShow(moveMonth(month, -navStep));
    next.disabled = !canShow(moveMonth(month, navStep));
    clear.hidden = state.input.required;
    todayButton.textContent = monthOnly ? '本月' : '今天';
    todayButton.disabled = !allowed(today);
    selection.textContent = selected ? labelOf(selected) : '';

    const options = monthOnly ? monthNames.map(item => year + '-' + pad(item)) : calendarDays(month);
    const visible = value => monthOnly || value.startsWith(month);
    const active = options.includes(preferred) && allowed(preferred)
      ? preferred
      : options.find(value => visible(value) && allowed(value));
    grid.innerHTML = options.map(value => {
      if (!value) return '<span aria-hidden="true"></span>';
      const activeDate = value === selected;
      const current = value === today;
      const text = Number(value.slice(-2)) + (monthOnly ? '月' : '');
      return `<button type="button" class="date-picker-option ${monthOnly ? 'date-picker-month' : 'date-picker-day'}${visible(value) ? '' : ' date-picker-outside'}"
        data-date-value="${value}" tabindex="${value === active ? 0 : -1}" aria-label="${labelOf(value)}" aria-pressed="${activeDate}"
        ${current ? 'aria-current="date"' : ''}${allowed(value) ? '' : ' disabled'}>${text}</button>`;
    }).join('');
  }

  function position() {
    const anchor = state.input.getBoundingClientRect();
    const fieldWidth = document.documentElement.clientWidth;
    const fieldHeight = document.documentElement.clientHeight;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const left = fieldWidth <= 480 ? (fieldWidth - width) / 2 : anchor.left;
    let top = anchor.bottom + 7;
    if (top + height > fieldHeight - 9) {
      const above = anchor.top - height - 7;
      top = above > 9 ? above : (fieldHeight - height) / 2;
    }
    popup.style.left = Math.round(Math.max(8, Math.min(left, fieldWidth - width - 8))) + 'px';
    popup.style.top = Math.round(Math.max(8, top)) + 'px';
  }

  function focusOption() {
    (grid.querySelector('[tabindex="0"]') || yearInput).focus({ preventScroll: true });
  }

  function close() {
    if (!state) return;
    const { input } = state;
    state = null;
    observer.disconnect();
    popup.close();
    popup.remove();
    input.setAttribute('aria-expanded', 'false');
    if (input.isConnected) input.focus({ preventScroll: true });
  }

  function choose(value) {
    if (!state || !isDateInput(state.input) || (value ? !allowed(value) : state.input.required)) return;
    const { input } = state;
    close();
    if (input.value !== value && input.isConnected) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  const observer = new MutationObserver(() => {
    if (state && (!state.input.isConnected || state.input.closest('[hidden], dialog:not([open])'))) close();
  });

  function open(input) {
    if (state) return;
    const monthOnly = input.getAttribute('type') === 'month';
    const today = shanghaiDay.format(new Date()).slice(0, monthOnly ? 7 : 10);
    const min = input.min || (monthOnly ? '0001-01' : '0001-01-01');
    const max = input.max || (monthOnly ? '9999-12' : '9999-12-31');
    const selected = input.value;
    const candidate = selected || today;
    const month = (candidate < min ? min : candidate > max ? max : candidate).slice(0, 7);
    const label = input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim();
    state = { input, monthOnly, selected, today, min, max, month };
    const prompt = monthOnly ? '选择月份' : '选择日期';
    title.textContent = label || prompt;
    popup.setAttribute('aria-label', prompt);
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'true');
    render();
    document.body.append(popup);
    popup.showModal();
    position();
    focusOption();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  }

  function showMonth(month, preferred) {
    if (!canShow(month)) return false;
    state.month = month;
    render(preferred);
    position();
    return true;
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || !isDateInput(event.target)) return;
    event.preventDefault();
    open(event.target);
  }, { capture: true });
  document.addEventListener('keydown', event => {
    if (!isDateInput(event.target) || event.defaultPrevented) return;
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'F4' && !(event.altKey && event.key === 'ArrowDown')) return;
    event.preventDefault();
    open(event.target);
  }, { capture: true });
  document.addEventListener('focusin', event => {
    if (isDateInput(event.target)) event.target.setAttribute('aria-haspopup', 'dialog');
  });

  popup.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  popup.addEventListener('click', event => {
    if (!state) return;
    if (event.target === popup) {
      const { top, left, bottom, right } = popup.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close();
      return;
    }
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const { dateAction, dateValue } = button.dataset;
    if (dateValue) return choose(dateValue);
    if (dateAction === 'close') return close();
    if (dateAction === 'clear') return choose('');
    if (dateAction === 'today') return choose(state.today);
    const offset = (dateAction === 'previous' ? -1 : 1) * (state.monthOnly ? 12 : 1);
    if (showMonth(moveMonth(state.month, offset)) && button.disabled) focusOption();
  });

  popup.addEventListener('keydown', event => {
    if (!state) return;
    const key = event.target.dataset.dateValue;
    const offset = gridKeys[event.key];
    if (!key || !offset) return;
    event.preventDefault();
    const nextValue = state.monthOnly
      ? moveMonth(key, Math.abs(offset) === 7 ? Math.sign(offset) * 3 : offset)
      : moveDate(key, offset);
    if (!allowed(nextValue)) return;
    if (showMonth(nextValue.slice(0, 7), nextValue)) focusOption();
  });
  monthSelect.addEventListener('change', () => showMonth(monthSelect.value));
  function updateYear() {
    if (!state) return;
    const year = Number(yearInput.value);
    const currentMonth = state.month.slice(-2);
    if (Number.isInteger(year) && year > 0 && year <= 9999) {
      const yearKey = pad(year, 4);
      const month = yearKey + '-' + currentMonth;
      const [min, max] = [state.min.slice(0, 7), state.max.slice(0, 7)];
      const nextMonth = month < min && min.startsWith(yearKey) ? min
        : month > max && max.startsWith(yearKey) ? max : month;
      if (showMonth(nextMonth)) return;
    }
    yearInput.value = Number(state.month.slice(0, 4));
  }
  yearInput.addEventListener('change', updateYear);
  yearInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    updateYear();
    focusOption();
  });
  window.addEventListener('resize', () => { if (state) position(); });
}
