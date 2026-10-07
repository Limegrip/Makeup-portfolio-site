// Меню в отдельном блоке с проверкой: без неё отсутствующий #burger уронил бы
// весь файл, а вместе с ним карусели, фильтр и отзывы.
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

if (burger && nav) {
  // На телефоне иконки связи в шапке скрыты — кладём их копию в меню.
  const contacts = document.querySelector('.header-actions')?.cloneNode(true);
  if (contacts) {
    contacts.className = 'nav-contacts';
    nav.append(contacts);
  }

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
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Блоки мягко всплывают, когда до них доходит прокрутка. Только те, что ниже первого
// экрана при загрузке: уже видимое не прячем, иначе оно мигнёт. Вложенные цели
// не берём — всплывает внешний блок целиком. Пришедшие вместе идут по очереди.
const revealSel = [
  '.eyebrow', '.section-title', '.section-sub',
  '.portfolio-banner > *', '.about-media', '.about-text > *',
  '.service-row', '.services-more', '.price-col', '.portfolio-item',
  '.why-media', '.why-text > :not(.why-list)', '.why-item',
  '.reviews .container > *', '.booking .container > *', '.cta .container > *',
  '.lp-section > :not(.lp-related, .lp-gallery)', '.lp-related a', '.lp-gallery > *', '.lp-cta > *',
  '.footer-social-strip'
].join(',');
// Карточка портфолио открывается, когда её кадр уже загружен: иначе шторка открывала
// пустую заглушку, и фото выстреливало позже. Дольше 1,2 с не ждём — на плохом
// интернете лучше заглушка, чем пустое место. new Image — тот же запрос, из кэша.
const mediaReady = card => {
  const media = card.querySelector('.is-active, img, video');
  const src = media?.tagName === 'VIDEO' ? media.poster || media.dataset.poster : media?.currentSrc || media?.src;
  if (!src) return Promise.resolve();
  const img = new Image();
  img.src = src;
  return Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 1200))]);
};
if (!reduceMotion.matches && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    let i = 0;
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      const delay = `${Math.min(i++, 5) * 90}ms`;
      const show = () => {
        target.style.animationDelay = delay;
        target.classList.add('is-in');
      };
      if (target.matches('.portfolio-item')) mediaReady(target).then(show);
      else show();
      io.unobserve(target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll(revealSel).forEach(el => {
    if (el.parentElement.closest(`${revealSel}, .hero, .lp-hero`)) return;
    if (el.getBoundingClientRect().top < innerHeight) return;
    el.classList.add('reveal');
    io.observe(el);
  });
}

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
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
      // aria-current, а не aria-pressed: точка выбирает текущий кадр, а не включается
      dot.toggleAttribute('aria-current', i === current);
    });
  };

  const advance = () => {
    if (current === slides.length - 1) return stop();
    show(current + 1);
  };

  card.addEventListener('mouseenter', () => {
    // При «уменьшить движение» кадры не листаются сами: без плавного перехода это рывки раз в 1,5 с.
    if (reduceMotion.matches) return;
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

// Фильтр портфолио по услуге. Категория — в data-category карточки: видимая подпись
// над названием расходилась с названием фильтра («Невесты» против «Свадебный образ»).
const pfChips = [...document.querySelectorAll('.pf-filters button')];
if (pfChips.length) {
  const pfItems = [...document.querySelectorAll('.portfolio-item')].map(el => ({
    el,
    category: el.dataset.category || ''
  }));

  const markChips = filter => pfChips.forEach(chip => {
    const on = chip.dataset.filter === filter;
    chip.classList.toggle('is-active', on);
    chip.setAttribute('aria-pressed', on);
  });
  const applyFilter = filter => {
    pfItems.forEach(({ el, category }) => {
      el.hidden = filter !== 'all' && category !== filter;
    });
    markChips(filter);
  };

  // Карточки перестраиваются плавно (View Transitions). Имена — только на время перехода:
  // иначе 24 карточки участвовали бы и в переходе между страницами.
  // Карточки, ещё не проявившиеся при прокрутке, показываем сразу — иначе в переходе они пустые.
  // Скрытые фильтром карточки не загружены: их обложки грузим по нажатию и меняем
  // карточки, когда готовы первые четыре (не дольше 0,6 с), — иначе они въезжали пустыми.
  // Чип переключаем сразу, чтобы нажатие не казалось потерянным.
  let pfRun = 0;
  const filterSmoothly = async filter => {
    pfItems.forEach(({ el }) => el.classList.remove('reveal'));
    if (!document.startViewTransition || reduceMotion.matches) return applyFilter(filter);
    const run = ++pfRun;
    markChips(filter);
    const shown = pfItems.filter(({ category }) => filter === 'all' || category === filter).map(({ el }) => el);
    shown.forEach(card => {
      const cover = card.querySelector('img, video');
      if (cover.tagName === 'IMG') cover.loading = 'eager';
      else if (cover.dataset.poster) cover.poster = cover.dataset.poster;
    });
    await Promise.race([Promise.all(shown.slice(0, 4).map(mediaReady)), new Promise(r => setTimeout(r, 600))]);
    if (run !== pfRun) return;   // пока ждали, нажали другой фильтр
    pfItems.forEach(({ el }, i) => { el.style.viewTransitionName = `pf-${i}`; });
    document.startViewTransition(() => applyFilter(filter)).finished.finally(() => {
      pfItems.forEach(({ el }) => { el.style.viewTransitionName = ''; });
    });
  };

  pfChips.forEach(chip => chip.addEventListener('click', () => filterSmoothly(chip.dataset.filter)));

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
    rvDots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === rvCurrent);
      dot.toggleAttribute('aria-current', i === rvCurrent);
    });
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

// Постеры видео: атрибут poster не умеет loading="lazy", поэтому подставляем
// его сами, когда карточка подходит к экрану. Иначе 24 постера тянутся сразу.
// Запас — полтора экрана: с меньшим обложка начинала грузиться почти в момент показа.
const lazyPosters = document.querySelectorAll('video[data-poster]');
if (lazyPosters.length) {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.poster = target.dataset.poster;
      obs.unobserve(target);
    });
  }, { rootMargin: '1500px 0px' });
  lazyPosters.forEach(v => io.observe(v));
}


// Своя кнопка ▶ вместо системного плеера: полоска «0:00» и громкость на обложке
// выглядят дешевле самих кадров. Плеер включается по первому нажатию.
// Без JS атрибут controls остаётся — видео всё равно можно посмотреть.
document.querySelectorAll('.portfolio-item video, .testimonial-video video').forEach(video => {
  let host = video.parentElement;
  // В карусели кнопка живёт в стопке (она уже relative), вне её — в обёртке по размеру видео.
  if (!host.matches('.pi-stack, .testimonial-video')) {
    host = document.createElement('div');
    host.className = 'pi-video';
    video.replaceWith(host);
    host.append(video);
  }
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'pi-play';
  play.setAttribute('aria-label', 'Смотреть видео');
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  video.controls = false;
  video.after(play);
  play.addEventListener('click', () => {
    video.controls = true;
    play.remove();
    video.play().catch(() => {});   // не дали запустить — плеер уже показан, нажмут сами
  });
});

// Переход по ссылке на раздел (#portfolio, #packages, #booking): браузер прокручивает сразу,
// а шрифты и блоки выше ещё догружаются и меняют высоту — раздел уезжал под шапку или вниз.
// Пока страница достраивается, после каждого изменения высоты доводим раздел на место.
// Человек сам начал листать — больше не трогаем.
const hashTarget = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
if (hashTarget) {
  let userMoved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(type =>
    addEventListener(type, () => { userMoved = true; }, { once: true, passive: true }));
  const settle = new ResizeObserver(() => {
    if (!userMoved) hashTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  settle.observe(document.body);
  setTimeout(() => settle.disconnect(), 4000);
}
