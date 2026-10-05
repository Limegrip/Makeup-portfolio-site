// Онлайн-запись. Свободное время считает функция в Yandex Cloud (backend/booking.py),
// здесь только показываем его и отправляем заявку.
// Выключатель: пустой data-api у #booking убирает с сайта и раздел, и пункт меню.
const bk = document.getElementById('booking');
const bkApi = bk?.dataset.api;

if (bk && !bkApi) {
  bk.hidden = true;
  document.querySelectorAll('a[href="#booking"]').forEach(a => { a.hidden = true; });
}

if (bk && bkApi) {
  const form = bk.querySelector('.bk');
  const servicesBox = form.querySelector('.bk-services');
  const daysBox = form.querySelector('.bk-days');
  const timesBox = form.querySelector('.bk-times');
  const monthName = form.querySelector('.bk-month-name');
  const nextBtn = form.querySelector('.bk-next');
  const prevBtn = form.querySelector('.bk-prev');
  const fallback = bk.querySelector('.bk-fallback');
  const loadError = form.querySelector('.bk-load-error');
  const summary = form.querySelector('.bk-summary');
  const status = form.querySelector('.bk-status');
  const submit = form.querySelector('.bk-submit');

  const pad = n => String(n).padStart(2, '0');
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const state = { service: '', month: thisMonth, date: '', time: '', services: [], days: {} };
  // Со страницы услуги приходят с ?service=wedding — выбираем её сами. Ставим после первого
  // ответа, когда список услуг известен: неизвестный id функция отклоняет целиком.
  let wanted = new URLSearchParams(location.search).get('service') || '';
  // Выпадающий список месяцев: свадьбу через полгода не листать стрелкой. 13 — запись на год вперёд.
  const months = Array.from({ length: 13 }, (_, i) => new Date(today.getFullYear(), today.getMonth() + i));
  const lastMonth = `${months[12].getFullYear()}-${pad(months[12].getMonth() + 1)}`;
  monthName.replaceChildren(...months.map(d => {
    const name = d.toLocaleDateString('ru', { month: 'long' });
    return new Option(`${name[0].toUpperCase()}${name.slice(1)} ${d.getFullYear()}`,
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }));
  let request = 0; // ответы на устаревшие запросы (быстро листали месяцы) игнорируем

  fallback.hidden = true;
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
    monthName.value = state.month;
    prevBtn.disabled = state.month <= thisMonth;
    nextBtn.disabled = state.month >= lastMonth;

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
    loadError.hidden = true;
    try {
      const params = new URLSearchParams({ month: state.month });
      if (state.service) params.set('service', state.service);
      const res = await fetch(`${bkApi}?${params}`);
      const data = await res.json();
      if (id !== request) return;
      if (!res.ok) throw new Error(data.error);
      state.services = data.services;
      if (wanted && wanted !== state.service && data.services.some(s => s.id === wanted)) {
        state.service = wanted;
        wanted = '';
        return load();
      }
      wanted = '';
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
      daysBox.removeAttribute('aria-busy');
      // Расписание не пришло ни разу — форма без услуг бесполезна, вместо неё контакты.
      if (!state.services.length) {
        form.hidden = true;
        fallback.hidden = false;
        return;
      }
      // TypeError — сеть или CORS: текст браузера («Failed to fetch») клиентке ничего не скажет
      loadError.textContent = err instanceof TypeError || !err.message
        ? 'Не удалось загрузить свободные даты. Попробуйте ещё раз или напишите в Telegram.'
        : err.message;
      loadError.hidden = false;
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
  // В студии — показываем её адрес; выезд — спрашиваем адрес клиентки.
  const showPlace = () => {
    const place = form.elements.place.value;
    form.querySelector('.bk-studio').hidden = place !== 'studio';
    form.querySelector('.bk-visit').hidden = place !== 'visit';
  };
  form.querySelectorAll('input[name="place"]').forEach(r => r.addEventListener('change', showPlace));

  prevBtn.addEventListener('click', () => shiftMonth(-1));
  nextBtn.addEventListener('click', () => shiftMonth(1));
  monthName.addEventListener('change', () => {
    state.month = monthName.value;
    load();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const problem = !state.time ? 'Выберите дату и время'
      : !f.place.value ? 'Выберите: в студии или выезд'
      : f.place.value === 'visit' && !f.address.value.trim() ? 'Укажите адрес выезда'
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
          name: f.name.value, phone: f.phone.value, place: f.place.value,
          address: f.place.value === 'visit' ? f.address.value : '',
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
      showPlace();
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
