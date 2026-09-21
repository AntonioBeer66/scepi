document.documentElement.classList.add('js');

const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');

function closeMenu(returnFocus = false) {
  navigation.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) toggle.focus();
}

toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('is-open', open);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.header')) closeMenu();
});

matchMedia('(min-width: 761px)').addEventListener('change', () => closeMenu());

// Hero Slider Functionality
const sliderContainer = document.querySelector('.slider-container');
let slideIndex = 0;
let autoAdvanceTimeout;
const slides = document.querySelectorAll('.slider-slide');
const dots = document.querySelectorAll('.slider-dot');
const totalSlides = slides.length;
const ADVANCE_INTERVAL = 4000; // 4 seconds

function goToSlide(index) {
  slideIndex = (index + totalSlides) % totalSlides;
  // Each slide is 100% of the container's own width, so translateX(-100%) per
  // step moves exactly one slide regardless of how many slides exist.
  sliderContainer.style.transform = `translateX(${-slideIndex * 100}%)`;
  dots.forEach((dot, i) => dot.setAttribute('aria-selected', String(i === slideIndex)));
}

function nextSlide() {
  goToSlide(slideIndex + 1);
}

function startAutoAdvance() {
  autoAdvanceTimeout = setTimeout(() => {
    nextSlide();
    startAutoAdvance();
  }, ADVANCE_INTERVAL);
}

function stopAutoAdvance() {
  clearTimeout(autoAdvanceTimeout);
}

// Initialize slider
if (sliderContainer && slides.length > 0) {
  // Set initial position
  sliderContainer.style.transform = 'translateX(0%)';

  // Start auto-advance
  startAutoAdvance();

  // Pause on hover/touch
  sliderContainer.addEventListener('mouseenter', stopAutoAdvance);
  sliderContainer.addEventListener('mouseleave', startAutoAdvance);
  sliderContainer.addEventListener('touchstart', stopAutoAdvance, { passive: true });
  sliderContainer.addEventListener('touchend', () => {
    setTimeout(startAutoAdvance, 2000); // Resume after 2 seconds of inactivity
  }, { passive: true });

  // Click navigation on the side thirds of the slider (not on links/buttons/dots)
  sliderContainer.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;

    const sliderWidth = sliderContainer.clientWidth;
    const clickX = e.clientX - sliderContainer.getBoundingClientRect().left;

    if (clickX < sliderWidth / 3) {
      goToSlide(slideIndex - 1);
      stopAutoAdvance();
      startAutoAdvance();
    } else if (clickX > sliderWidth * 2 / 3) {
      goToSlide(slideIndex + 1);
      stopAutoAdvance();
      startAutoAdvance();
    }
  });

  // Dot navigation
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goToSlide(i);
      stopAutoAdvance();
      startAutoAdvance();
    });
  });
}

// Handle visibility change to pause when tab is hidden (slider pages only)
if (sliderContainer && slides.length > 0) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoAdvance();
    } else {
      startAutoAdvance();
    }
  });
}