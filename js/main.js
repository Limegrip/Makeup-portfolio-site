const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

burger.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
});

nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  });
});

// Карусель в карточках портфолио: кадры одного человека лежат в одном боксе.
// Видео всегда последнее в стопке — на нём автопролистывание останавливается,
// чтобы кадр не уезжал, пока человек собирается нажать play.
document.querySelectorAll('.portfolio-item .pi-stack').forEach(stack => {
  const slides = [...stack.children];
  if (slides.length < 2) return;

  const card = stack.closest('.portfolio-item');
  const dots = [...card.querySelectorAll('.pi-dots button')];
  let current = 0;
  let timer = null;

  const stop = () => { clearInterval(timer); timer = null; };

  const show = index => {
    const leaving = slides[current];
    if (leaving.tagName === 'VIDEO') leaving.pause();
    current = index;
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
  };

  const advance = () => {
    if (current === slides.length - 1) return stop();
    show(current + 1);
  };

  card.addEventListener('mouseenter', () => {
    if (!timer) timer = setInterval(advance, 1500);
  });
  card.addEventListener('mouseleave', () => {
    stop();
    show(0);
  });

  // Палец: тап листает дальше. На видео тап не перехватываем — он нужен плееру,
  // вернуться к первому кадру можно точкой под карточкой.
  card.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    if (slides[current].tagName === 'VIDEO') return;
    advance();
  });

  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    stop();
    show(i);
  }));
});

// Фильтр портфолио по услуге. Категорию карточка уже несёт в подписи,
// поэтому отдельных data-атрибутов на карточках не нужно.
const pfChips = [...document.querySelectorAll('.pf-filters button')];
if (pfChips.length) {
  const pfItems = [...document.querySelectorAll('.portfolio-item')].map(el => ({
    el,
    category: el.querySelector('figcaption .eyebrow')?.textContent.trim() || ''
  }));

  const applyFilter = filter => {
    pfItems.forEach(({ el, category }) => {
      el.hidden = filter !== 'all' && category !== filter;
    });
    pfChips.forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === filter));
  };

  pfChips.forEach(chip => chip.addEventListener('click', () => applyFilter(chip.dataset.filter)));

  // Строки в «Услугах» ведут в портфолио с уже включённым фильтром.
  document.querySelectorAll('.service-row[data-filter]').forEach(row => {
    row.addEventListener('click', () => applyFilter(row.dataset.filter));
  });
}

// Карусель отзывов: одна история за раз — секция перестаёт занимать пол-экрана.
// Листается стрелками, точками и свайпом; видео при уходе со слайда ставится на паузу.
const rvCarousel = document.querySelector('.rv-carousel');
if (rvCarousel) {
  const rvSlides = [...rvCarousel.querySelectorAll('.rv-slide')];
  const rvDots = [...rvCarousel.querySelectorAll('.rv-dots button')];
  let rvCurrent = 0;

  const rvShow = index => {
    const next = (index + rvSlides.length) % rvSlides.length;
    if (next === rvCurrent) return;
    rvSlides[rvCurrent].querySelector('video')?.pause();
    rvCurrent = next;
    rvSlides.forEach((slide, i) => { slide.hidden = i !== rvCurrent; });
    rvDots.forEach((dot, i) => dot.classList.toggle('is-active', i === rvCurrent));
  };

  rvCarousel.querySelector('.rv-prev').addEventListener('click', () => rvShow(rvCurrent - 1));
  rvCarousel.querySelector('.rv-next').addEventListener('click', () => rvShow(rvCurrent + 1));
  rvDots.forEach((dot, i) => dot.addEventListener('click', () => rvShow(i)));

  // Свайп пальцем. Порог в 40px, чтобы тап по плееру не считался листанием.
  // Мышь не трогаем — протяжка по тексту должна выделять текст, а не листать.
  let rvStartX = null;
  rvCarousel.addEventListener('pointerdown', e => {
    rvStartX = e.pointerType === 'touch' ? e.clientX : null;
  });
  rvCarousel.addEventListener('pointerup', e => {
    if (rvStartX === null) return;
    const shift = e.clientX - rvStartX;
    rvStartX = null;
    if (Math.abs(shift) > 40) rvShow(rvCurrent + (shift < 0 ? 1 : -1));
  });
}
