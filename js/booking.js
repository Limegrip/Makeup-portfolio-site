// Онлайн-запись. Свободное время считает функция в Yandex Cloud (backend/booking.py),
// здесь только показываем его и отправляем заявку. Без адреса функции в data-api
// форма остаётся скрытой, а вместо неё видна ссылка на Telegram.
const bk = document.getElementById('booking');
const bkApi = bk?.dataset.api;

if (bk && bkApi) {
  const form = bk.querySelector('.bk');
  const servicesBox = form.querySelector('.bk-services');
  const daysBox = form.querySelector('.bk-days');
  const timesBox = form.querySelector('.bk-times');
  const monthName = form.querySelector('.bk-month-name');
  const prevBtn = form.querySelector('.bk-prev');
  const summary = form.querySelector('.bk-summary');
  const status = form.querySelector('.bk-status');
  const submit = form.querySelector('.bk-submit');

  const pad = n => String(n).padStart(2, '0');
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const state = { service: '', month: thisMonth, date: '', time: '', services: [], days: {} };
  let request = 0; // ответы на устаревшие запросы (быстро листали месяцы) игнорируем

  bk.querySelector('.bk-fallback').hidden = true;
  form.hidden = false;

  const chip = (label, on, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on);
    b.addEventListener('click', onClick);
    return b;
  };

  const dateLabel = iso => new Date(`${iso}T12:00`).toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short' });

  const renderSummary = () => {
    const service = state.services.find(s => s.id === state.service);
    summary.textContent = service && state.date && state.time
      ? `${service.name} · ${dateLabel(state.date)}, ${state.time}`
      : '';
  };

  const renderTimes = () => {
    const times = state.days[state.date] || [];
    timesBox.replaceChildren(...(state.date
      ? times.map(t => chip(t, t === state.time, () => { state.time = t; renderTimes(); }))
      : []));
    if (!state.date) timesBox.innerHTML = '<p class="bk-hint">Сначала выберите дату</p>';
    renderSummary();
  };

  const renderDays = () => {
    const [y, m] = state.month.split('-').map(Number);
    const name = new Date(y, m - 1).toLocaleDateString('ru', { month: 'long' });
    monthName.textContent = `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
    prevBtn.disabled = state.month <= thisMonth;

    const cells = [];
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // понедельник — первый
    for (let i = 0; i < offset; i++) cells.push(document.createElement('span'));
    const count = new Date(y, m, 0).getDate();
    for (let d = 1; d <= count; d++) {
      const iso = `${state.month}-${pad(d)}`;
      const free = (state.days[iso] || []).length > 0;
      const b = chip(String(d), iso === state.date, () => {
        state.date = iso;
        state.time = '';
        renderDays();
        renderTimes();
      });
      b.disabled = !free;
      b.setAttribute('aria-label', `${dateLabel(iso)}${free ? '' : ' — занято'}`);
      cells.push(b);
    }
    daysBox.replaceChildren(...cells);
  };

  const load = async () => {
    const id = ++request;
    daysBox.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      const params = new URLSearchParams({ month: state.month });
      if (state.service) params.set('service', state.service);
      const res = await fetch(`${bkApi}?${params}`);
      const data = await res.json();
      if (id !== request) return;
      if (!res.ok) throw new Error(data.error);
      state.services = data.services;
      state.service ||= data.services[0].id;
      state.days = data.days;
      if (!state.days[state.date]?.includes(state.time)) state.time = '';
      if (!state.days[state.date]?.length) state.date = '';
      servicesBox.replaceChildren(...state.services.map(s => chip(s.name, s.id === state.service, () => {
        state.service = s.id;
        load();
      })));
    } catch (err) {
      if (id !== request) return;
      state.days = {};
      status.textContent = err.message || 'Не удалось загрузить расписание. Попробуйте позже или напишите в Telegram.';
    }
    daysBox.removeAttribute('aria-busy');
    renderDays();
    renderTimes();
  };

  const shiftMonth = step => {
    const [y, m] = state.month.split('-').map(Number);
    const next = new Date(y, m - 1 + step);
    state.month = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
    load();
  };
  prevBtn.addEventListener('click', () => shiftMonth(-1));
  form.querySelector('.bk-next').addEventListener('click', () => shiftMonth(1));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const problem = !state.time ? 'Выберите дату и время'
      : !f.name.value.trim() ? 'Укажите имя'
      : !f.phone.value.trim() ? 'Укажите телефон'
      : !f.consent.checked ? 'Нужно согласие на обработку данных'
      : '';
    if (problem) { status.textContent = problem; return; }

    submit.disabled = true;
    status.textContent = 'Отправляем…';
    try {
      // text/plain — «простой» запрос без предварительного OPTIONS, на секунду быстрее
      const res = await fetch(bkApi, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          service: state.service, date: state.date, time: state.time,
          name: f.name.value, phone: f.phone.value, address: f.address.value,
          comment: f.comment.value, consent: f.consent.checked, website: f.website.value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        status.textContent = data.error;
        if (res.status === 409) load();
        return;
      }
      form.reset();
      state.date = state.time = '';
      await load();
      status.textContent = 'Заявка отправлена! Анастасия свяжется с вами, чтобы подтвердить запись.';
    } catch {
      status.textContent = 'Не удалось отправить. Проверьте интернет или напишите в Telegram.';
    } finally {
      submit.disabled = false;
    }
  });

  load();
}
