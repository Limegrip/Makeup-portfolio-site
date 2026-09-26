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
