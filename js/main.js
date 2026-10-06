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
if (!reduceMotion.matches && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    let i = 0;
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.style.animationDelay = `${Math.min(i++, 5) * 90}ms`;
      target.classList.add('is-in');
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

  const applyFilter = filter => {
    pfItems.forEach(({ el, category }) => {
      el.hidden = filter !== 'all' && category !== filter;
    });
    pfChips.forEach(chip => {
      const on = chip.dataset.filter === filter;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', on);
    });
  };

  // Карточки перестраиваются плавно (View Transitions). Имена — только на время перехода:
  // иначе 24 карточки участвовали бы и в переходе между страницами.
  // Карточки, ещё не проявившиеся при прокрутке, показываем сразу — иначе в переходе они пустые.
  const filterSmoothly = filter => {
    pfItems.forEach(({ el }) => el.classList.remove('reveal'));
    if (!document.startViewTransition || reduceMotion.matches) return applyFilter(filter);
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
const lazyPosters = document.querySelectorAll('video[data-poster]');
if (lazyPosters.length) {
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.poster = target.dataset.poster;
      obs.unobserve(target);
    });
  }, { rootMargin: '400px' });
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
