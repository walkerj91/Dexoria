/* =============================================
   carousel.js — TCG Sets Carousel (Infinite Loop)
   Dexoria · Home Page
   ============================================= */

(function () {

  /* ── Elements ─────────────────────────────── */
  const track    = document.getElementById('track');
  const dotsWrap = document.getElementById('dots');

  if (!track || !dotsWrap) return;

  const originals = Array.from(track.querySelectorAll('.pcard'));
  if (!originals.length) return;

  const N        = originals.length; // number of real cards
  const INTERVAL = 4000;

  /* ── Clone cards for infinite loop ───────────
     Target layout: [PB CR PO AH PF ME] [PB CR PO AH PF ME] [PB CR PO AH PF ME]
                     ← prepend clones →  ←    originals    →  ← append clones →

     IMPORTANT: Use a DocumentFragment for the prepend so cards are inserted
     in the correct order. Inserting individually with insertBefore(x, firstChild)
     reverses them.                                                              */
  const preFrag = document.createDocumentFragment();
  originals.forEach(c => preFrag.appendChild(c.cloneNode(true)));
  track.insertBefore(preFrag, track.firstChild);      // prepend all at once, in order

  originals.forEach(c => track.appendChild(c.cloneNode(true))); // append in order

  /* ── State ────────────────────────────────── */
  let currentIndex  = N;   // start at first real card (index N, after prepended clones)
  let autoTimer     = null;
  let transitioning = false;

  /* ── Measure one card's full width ───────────
     Called fresh each time so resize is handled automatically */
  function cardW() {
    const card = track.children[0];
    const s    = getComputedStyle(card);
    return card.offsetWidth
      + parseFloat(s.marginLeft  || 0)
      + parseFloat(s.marginRight || 0);
  }

  /* ── Slide to index ───────────────────────────
     animate = false → instant jump with no visual change.
     The void reflow flush is critical: it forces the browser to
     apply `transition: none` before we update `transform`,
     preventing the two style changes from being batched together
     into a visible animated move.                               */
  function slideTo(index, animate) {
    if (animate) {
      track.style.transition = 'transform 0.45s ease';
    } else {
      track.style.transition = 'none';
      void track.offsetWidth; // ← force reflow flush
    }
    track.style.transform = `translateX(-${index * cardW()}px)`;
    currentIndex = index;
    updateDots();
  }

  /* ── After each animated slide, silently jump
     back into real-card territory if we've drifted
     into clone territory.

     Filter by propertyName so we don't fire multiple
     times when other CSS properties also transition.  */
  track.addEventListener('transitionend', e => {
    if (e.propertyName !== 'transform') return;

    if (currentIndex >= N * 2) {
      // Slid forward into appended clones → jump to matching real card
      slideTo(currentIndex - N, false);
    } else if (currentIndex < N) {
      // Slid backward into prepended clones → jump to matching real card
      slideTo(currentIndex + N, false);
    }

    transitioning = false;
  });

  /* ── Dots ─────────────────────────────────── */
  function activeDot() {
    return ((currentIndex - N) % N + N) % N;
  }

  function buildDots() {
    dotsWrap.innerHTML = '';
    originals.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => {
        go(N + i);
        resetTimer();
      });
      dotsWrap.appendChild(dot);
    });
    updateDots();
  }

  function updateDots() {
    dotsWrap.querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('active', i === activeDot())
    );
  }

  /* ── Navigate ─────────────────────────────── */
  function go(index) {
    if (transitioning) return;
    transitioning = true;
    slideTo(index, true);
  }

  function next() { go(currentIndex + 1); }
  function prev() { go(currentIndex - 1); }

  /* ── Auto-play ────────────────────────────── */
  function startTimer() { autoTimer = setInterval(next, INTERVAL); }
  function resetTimer()  { clearInterval(autoTimer); startTimer(); }

  /* ── Pause on hover ───────────────────────── */
  const wrapper = track.closest('.carousel-wrapper');
  if (wrapper) {
    wrapper.addEventListener('mouseenter', () => clearInterval(autoTimer));
    wrapper.addEventListener('mouseleave', startTimer);
  }

  /* ── Touch / swipe ────────────────────────── */
  let touchX = 0;
  track.addEventListener('touchstart', e => {
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const delta = touchX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      delta > 0 ? next() : prev();
      resetTimer();
    }
  }, { passive: true });

  /* ── Re-snap on resize ────────────────────── */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => slideTo(currentIndex, false), 150);
  });

  /* ── Init ─────────────────────────────────── */
  slideTo(N, false);
  buildDots();
  startTimer();

})();