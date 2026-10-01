// ──────────────────────────────────────────────────────
//  demo.js — animated widget demo (pure CSS/JS)
//  Mimics the real PixelScribe floating widget
// ──────────────────────────────────────────────────────

(function () {
  // ── Data: rename sequences to cycle through ──
  const SEQUENCES = [
    {
      before: 'IMG_4821.jpg',
      after:  'golden-gate-sunset.jpg',
    },
    {
      before: 'Screenshot 2024-09-28.png',
      after:  'macbook-display-settings.png',
    },
    {
      before: 'IMG_0032_BURST.jpg',
      after:  'coffee-latte-art-cafe.jpg',
    },
  ];

  // ── Badge cycling in hero ──
  const BADGE_PAIRS = SEQUENCES;
  let badgeIdx = 0;
  const badgeBefore = document.getElementById('badge-before');
  const badgeAfter  = document.getElementById('badge-after');

  function cycleBadge() {
    if (!badgeBefore || !badgeAfter) return;
    badgeBefore.style.opacity = '0';
    badgeAfter.style.opacity  = '0';
    setTimeout(() => {
      badgeIdx = (badgeIdx + 1) % BADGE_PAIRS.length;
      badgeBefore.textContent = BADGE_PAIRS[badgeIdx].before;
      badgeAfter.textContent  = BADGE_PAIRS[badgeIdx].after;
      badgeBefore.style.opacity = '1';
      badgeAfter.style.opacity  = '1';
    }, 350);
  }

  setInterval(cycleBadge, 3000);

  // ── Widget animation engine ──
  //
  // Each "cycle" picks one item from SEQUENCES and plays:
  //  t=0:    row slides in showing filename + spinning ring
  //  t=0→2s: ring fill animates 0→100%
  //  t=2s:   ring becomes ✓, old name strikethrough, new name fades in
  //  t=4s:   row fades to lower opacity (done state)
  //  t=5s:   next item starts (max 2 visible rows), loop repeats

  const CIRC = 2 * Math.PI * 10; // circumference r=10

  let seqIdx = 0;

  // We show at most 2 rows in the demo widget
  const rows = [
    document.getElementById('demo-row-0'),
    document.getElementById('demo-row-1'),
  ];

  function getRowEls(row) {
    return {
      ring:     row.querySelector('.w-ring'),
      ringFill: row.querySelector('.w-ring-circle-fill'),
      ringCheck:row.querySelector('.w-ring-check'),
      ringCheckPath: row.querySelector('.w-ring-check-mark'),
      msg:      row.querySelector('.w-msg'),
      names:    row.querySelector('.w-names'),
      wnOld:    row.querySelector('.wn-old'),
      wnNew:    row.querySelector('.wn-new'),
      undoBtn:  row.querySelector('.w-undo-btn'),
    };
  }

  function resetRow(row) {
    const el = getRowEls(row);
    row.classList.remove('visible');
    // show ring
    el.ring.style.display    = 'block';
    el.ringCheck.style.display = 'none';
    el.ringFill.style.strokeDasharray = `0 ${CIRC}`;
    // show msg, hide names
    el.msg.style.display    = 'flex';
    el.names.style.display  = 'none';
    el.wnNew.classList.remove('show');
    el.undoBtn.classList.remove('show');
    row.style.opacity = '1';
  }

  function animateRow(rowEl, seq, onDone) {
    const el = getRowEls(rowEl);

    // Step 0: set filename, slide in
    el.msg.textContent    = seq.before;
    el.wnOld.textContent  = seq.before;
    el.wnNew.textContent  = seq.after;
    el.msg.style.display  = 'flex';
    el.names.style.display = 'none';
    el.ring.style.display  = 'block';
    el.ringCheck.style.display = 'none';
    el.ringFill.style.strokeDasharray = `0 ${CIRC}`;
    el.undoBtn.classList.remove('show');
    el.wnNew.classList.remove('show');

    // slide in
    requestAnimationFrame(() => {
      rowEl.classList.add('visible');
    });

    // Step 1: animate ring fill over 1800ms
    const start = performance.now();
    const FILL_DURATION = 1800;

    function fillTick(now) {
      const elapsed = now - start;
      const pct = Math.min(elapsed / FILL_DURATION, 1);
      const dash = pct * CIRC;
      el.ringFill.style.strokeDasharray = `${dash} ${CIRC}`;
      if (pct < 1) {
        requestAnimationFrame(fillTick);
      } else {
        // Step 2: swap ring → ✓, show names
        setTimeout(() => {
          el.ring.style.display      = 'none';
          el.ringCheck.style.display = 'block';
          el.msg.style.display       = 'none';
          el.names.style.display     = 'flex';
          // animate new name in
          setTimeout(() => {
            el.wnNew.classList.add('show');
            el.undoBtn.classList.add('show');
          }, 80);

          // Step 3: fade row to done opacity, signal done
          setTimeout(() => {
            rowEl.style.opacity = '0.55';
            if (onDone) onDone();
          }, 1400);
        }, 150);
      }
    }

    requestAnimationFrame(fillTick);
  }

  // Orchestrate the two-row loop
  let currentSlot = 0; // which row (0 or 1) gets the next animation

  function runNext() {
    const seq    = SEQUENCES[seqIdx % SEQUENCES.length];
    const rowEl  = rows[currentSlot % 2];
    seqIdx++;
    currentSlot++;

    resetRow(rowEl);

    // Brief pause before starting animation
    setTimeout(() => {
      animateRow(rowEl, seq, () => {
        // start next after 1.2s gap
        setTimeout(runNext, 1200);
      });
    }, 120);
  }

  // Kick off after a short delay so page loads first
  setTimeout(() => {
    rows.forEach(resetRow);
    runNext();
  }, 800);

  // ── Accordion ──
  const trigger = document.querySelector('.acc-trigger');
  const body    = document.querySelector('.acc-body');

  if (trigger && body) {
    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!expanded));
      body.classList.toggle('open', !expanded);
    });
  }

  // ── Scroll reveal ──
  const revealEls = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealEls.forEach((el) => revealObserver.observe(el));
})();
