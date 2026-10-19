/* BT Weld FAB 500HD — vanilla only, no dependencies. Ports to the child theme. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- Smooth scroll to #book-demo, disabled under reduced motion ------- */
  document.querySelectorAll('[data-cta], a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id.charAt(0) !== '#' || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var head = document.querySelector('.bt-masthead');
      var offset = (head ? head.getBoundingClientRect().height : 0) + 12;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: reduced.matches ? 'auto' : 'smooth' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  /* ---- Sticky CTA appears past the hero -------------------------------- */
  var sticky = document.getElementById('sticky');
  var masthead = document.querySelector('.bt-masthead');
  var hero = document.querySelector('.bt-hero');
  var demo = document.getElementById('book-demo');

  // Guarded on the hero alone: the masthead's ground has to arrive whether or
  // not the bottom bar is on the page.
  if (hero && 'IntersectionObserver' in window) {
    var pastHero = false;
    var atForm = false;
    var sync = function () {
      if (sticky) sticky.classList.toggle('is-visible', pastHero && !atForm);
      if (masthead) masthead.classList.toggle('is-landed', pastHero);
    };
    new IntersectionObserver(function (entries) {
      pastHero = !entries[0].isIntersecting;
      sync();
    }, { rootMargin: '-40% 0px 0px 0px' }).observe(hero);

    if (demo) {
      new IntersectionObserver(function (entries) {
        atForm = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.35 }).observe(demo);
    }
  }

  /* ---- Scroll reveals --------------------------------------------------- */
  var reveals = document.querySelectorAll('.bt-reveal');
  if ('IntersectionObserver' in window && !reduced.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---- Clip window ------------------------------------------------------
     Plays only data-clip-start -> data-clip-end and loops that range.
     This exists because the source file is not yet trimmed. Once the asset
     is cut to the intended 9s, delete the two data- attributes in the markup
     and the native loop attribute handles it with no JS at all. */
  document.querySelectorAll('video[data-clip-start]').forEach(function (v) {
    var start = parseFloat(v.getAttribute('data-clip-start')) || 0;
    var endAttr = parseFloat(v.getAttribute('data-clip-end'));
    var end = isNaN(endAttr) ? Infinity : endAttr;

    function toStart() {
      try { v.currentTime = start; } catch (e) { /* not seekable yet */ }
    }

    if (v.readyState >= 1) toStart();
    v.addEventListener('loadedmetadata', toStart);

    v.addEventListener('timeupdate', function () {
      if (v.currentTime >= end || v.currentTime < start - 0.25) {
        toStart();
        if (v.paused && !reduced.matches) v.play().catch(function () {});
      }
    });

    // the native loop attribute restarts at 0, so catch that and re-seek
    v.addEventListener('seeked', function () {
      if (v.currentTime < start - 0.25) toStart();
    });
  });

  /* ---- Video: autoplay unless reduced motion --------------------------- */
  function applyMotionPolicy() {
    document.querySelectorAll('video').forEach(function (v) {
      if (reduced.matches) {
        v.removeAttribute('autoplay');
        v.pause();
        var holder = v.parentElement;
        if (holder && !holder.querySelector('.bt-playbtn')) {
          var btn = document.createElement('button');
          btn.className = 'bt-playbtn';
          btn.type = 'button';
          btn.setAttribute('aria-label', 'Play video');
          btn.innerHTML = '<span><svg width="20" height="22" viewBox="0 0 20 22" fill="#fff" aria-hidden="true"><path d="M0 0l20 11L0 22z"/></svg></span>';
          btn.addEventListener('click', function () { v.play(); btn.remove(); });
          holder.appendChild(btn);
        }
      } else {
        v.play().catch(function () { /* autoplay blocked; poster stands in */ });
      }
    });
  }
  applyMotionPolicy();
  if (reduced.addEventListener) reduced.addEventListener('change', applyMotionPolicy);

  /* ---- Process rail ------------------------------------------------------
     The rail is the machine's mode selector. Page scroll turns it; the card
     at the focus slot is the engaged process. Cards either side recede in
     depth, and the layered stage parallaxes so the cut-out and the footage
     separate. Mobile and reduced-motion get an ordinary snap carousel. */
  document.querySelectorAll('[data-rail]').forEach(function (rail) {
    var viewport = rail.querySelector('[data-rail-viewport]');
    var list = rail.querySelector('[data-rail-list]');
    var cards = [].slice.call(rail.querySelectorAll('[data-rail-card]'));
    var section = rail.closest('[data-mp]');
    var pin = section && section.querySelector('[data-mp-pin]');
    var beadBar = rail.querySelector('[data-seam-h]');   // mobile's flat bead
    if (!viewport || !list || !cards.length || !section || !pin) return;

    var desktop = window.matchMedia('(min-width: 1024px)');
    var stickTop = 0;

    // spatter
    var sparkWrap = section.querySelector('[data-sparks]');
    var sparks = sparkWrap ? [].slice.call(sparkWrap.querySelectorAll('.bt-spark')) : [];
    var sparkIdx = 0;
    var lastSparkY = null;

    // weld seam
    var seam = rail.querySelector('[data-seam]');
    var beadClip = seam && seam.querySelector('[data-bead-clip]');
    var beadHeat = seam && seam.querySelector('[data-bead-heat]');
    var seamHead = seam && seam.querySelector('[data-seam-head]');
    var seamH = 0;

    var metrics = [];
    var spacing = 1;
    var current = -1;
    var strikeTimer = null;

    var focusOffset = 0;

    function measure() {
      var vh = viewport.clientHeight;
      focusOffset = vh * 0.3;

      // The pin can stick at a negative top: mobile rides the video band up
      // out of frame before the copy holds. Read once per layout, not per
      // frame, and treat the unpinned 'auto' as zero.
      stickTop = parseFloat(window.getComputedStyle(pin).top) || 0;

      // Pad the list so the first and last card can each reach the focus
      // slot. Without this the last card bottoms out short of it, and the
      // engaged LED ends up on a different card than the one in focus.
      list.style.paddingTop = '0px';
      list.style.paddingBottom = '0px';
      var firstH = cards[0].offsetHeight;
      var lastH = cards[cards.length - 1].offsetHeight;
      list.style.paddingTop = Math.max(0, focusOffset - firstH / 2) + 'px';
      list.style.paddingBottom = Math.max(0, vh - focusOffset - lastH / 2) + 'px';

      if (seam) {
        seamH = viewport.clientHeight;
        seam.setAttribute('viewBox', '0 0 20 ' + seamH);
        seam.querySelector('.bt-seam__track').setAttribute('y2', seamH);
        seam.querySelector('.bt-seam__bead').setAttribute('y2', seamH);
        seam.querySelector('.bt-seam__flare').setAttribute('y2', seamH);
      }

      metrics = cards.map(function (c) {
        return { top: c.offsetTop, h: c.offsetHeight };
      });
      spacing = metrics.length > 1
        ? Math.max(1, metrics[1].top - metrics[0].top)
        : Math.max(1, metrics[0] ? metrics[0].h : 1);
    }

    // Pinned at every width now: the heading and body holding still while
    // the processes run past is the section, not a desktop luxury.
    function pinned() { return !reduced.matches; }

    function engage(i) {
      if (i === current) return;
      current = i;
      section.classList.toggle('is-resolved', i === cards.length - 1);
      if (i >= cards.length - 2) cards[cards.length - 1].classList.add('is-forged');
      cards.forEach(function (c, n) {
        var on = n === i;
        c.classList.toggle('is-active', on);
        if (on) {
          // restart the strike even if it is mid-flight
          c.classList.remove('is-striking');
          void c.offsetWidth;
          c.classList.add('is-striking');
        }
      });
      if (seam) {
        seam.classList.remove('is-kick');
        void seam.getBoundingClientRect();
        seam.classList.add('is-kick');
      }
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(function () {
        cards.forEach(function (c) { c.classList.remove('is-striking'); });
        if (seam) seam.classList.remove('is-kick');
      }, 600);
    }

    // One burst per short scroll, thrown from wherever the head currently
    // sits. Jittered so no two land identically.
    function throwSpark(x, y) {
      if (!sparks.length || reduced.matches) return;
      var el = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % sparks.length;
      el.style.left = x.toFixed(0) + 'px';
      el.style.top = y.toFixed(0) + 'px';
      el.style.setProperty('--spark-dur', (680 + Math.random() * 260).toFixed(0) + 'ms');
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    }

    function clearDepth() {
      list.style.transform = '';
      list.style.paddingTop = '';
      list.style.paddingBottom = '';
      cards.forEach(function (c) {
        c.style.transform = '';
        c.style.opacity = '';
        c.style.removeProperty('--plate');
        c.style.filter = '';
      });
    }

    /* Mobile: the cards sit in normal flow, so nothing is translated and
       nothing is faded — every process stays legible, which the pinned
       depth effect cannot promise. All that moves is which card is lit and
       how much bead has been laid along the foot. */
    function mobileSync() {
      var r = list.getBoundingClientRect();
      if (!r.height) return;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var focus = vh * 0.58;

      var p = (focus - r.top) / r.height;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (beadBar) beadBar.style.setProperty('--laid', p.toFixed(4));

      var best = 0, bestD = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var cr = cards[i].getBoundingClientRect();
        var d = Math.abs(cr.top + cr.height / 2 - focus);
        if (d < bestD) { bestD = d; best = i; }
      }
      engage(best);
      if (p >= 0.62) cards[cards.length - 1].classList.add('is-forged');
    }

    function apply() {
      if (!pinned()) {
        section.removeAttribute('data-pinned');
        clearDepth();
        mobileSync();
        return;
      }
      section.setAttribute('data-pinned', '');
      if (!metrics.length || metrics[0].h === 0) measure();

      var runway = section.offsetHeight - pin.offsetHeight;
      if (runway <= 0) { clearDepth(); return; }

      // Progress starts when the pin actually sticks, not when the section
      // does — otherwise the rail arrives part-advanced and runs out early.
      var p = (-section.getBoundingClientRect().top + stickTop) / runway;
      p = p < 0 ? 0 : p > 1 ? 1 : p;

      // Latch the closing card's forge off scroll progress, not off the
      // per-card distance: the card loop only runs when a frame is served,
      // so a throttled or skipped frame could miss the window entirely.
      // One-way, and early enough that it has played before arrival.
      if (p >= 0.62) cards[cards.length - 1].classList.add('is-forged');

      // the flat bead reads the pin's own progress while pinned
      if (beadBar) beadBar.style.setProperty('--laid', p.toFixed(4));

      var travel = Math.max(0, list.scrollHeight - viewport.clientHeight);
      var shift = p * travel;
      list.style.transform = 'translate3d(0,' + (-shift).toFixed(1) + 'px,0)';

      // the focus slot sits in the upper third, clear of the mask fade
      var focusY = shift + focusOffset;

      var best = 0, bestD = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var m = metrics[i];
        var d = (m.top + m.h / 2 - focusY) / spacing;   // distance in card-slots
        var ad = Math.abs(d);
        if (ad < bestD) { bestD = ad; best = i; }

        // Eased falloff that actually reaches zero, so a card fades out
        // rather than lingering at a floor. Scale and blur ride the same
        // curve so depth, focus and presence resolve together.
        var t = ad / 2.25;
        if (t > 1) t = 1;
        var fade = 1 - t * t * (3 - 2 * t);              // smoothstep
        var k = ad > 3 ? 3 : ad;
        var scale = 1 - k * 0.045;
        var opacity = fade;
        var blur = (1 - fade) * 3.2;
        var slide = d * 6;                               // slight depth drift

        cards[i].style.transform =
          'translate3d(' + slide.toFixed(1) + 'px,0,0) scale(' + scale.toFixed(3) + ')';
        cards[i].style.opacity = opacity.toFixed(3);
        cards[i].style.filter = blur ? 'blur(' + blur.toFixed(2) + 'px)' : '';
        // The plate dissolves on a steeper curve than the type it holds, so
        // a card leaving focus stops reading as a rectangle with a hard edge.
        cards[i].style.setProperty('--plate', (fade * fade * fade).toFixed(3));
      }

      engage(best);

      // lay the bead: the head travels, the heat gradient follows it
      if (seam && seamH) {
        var headY = p * seamH;
        beadClip.setAttribute('height', headY.toFixed(1));
        beadHeat.setAttribute('y1', (headY - 220).toFixed(1));
        beadHeat.setAttribute('y2', headY.toFixed(1));
        seamHead.setAttribute('transform', 'translate(0,' + headY.toFixed(1) + ')');

        // a short scroll is roughly one wheel notch of travel down the seam
        var sr = seam.getBoundingClientRect();
        var pr = pin.getBoundingClientRect();
        var absY = sr.top - pr.top + headY;
        var absX = sr.left - pr.left + sr.width / 2;
        if (lastSparkY === null) lastSparkY = absY;
        if (Math.abs(absY - lastSparkY) >= 34) {
          lastSparkY = absY;
          throwSpark(absX, absY);
        }
      }

      // the stage stays still: the product and the footage do not move
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; apply(); });
    }

    function onResize() { measure(); onScroll(); }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (desktop.addEventListener) desktop.addEventListener('change', onResize);
    if (reduced.addEventListener) reduced.addEventListener('change', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

    // Idle loops (the float and the glow breathe) only run while the section
    // is on screen — animate.md: a nonessential loop stops when offscreen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            section.setAttribute('data-inview', '');
            if (seam && seam.unpauseAnimations) seam.unpauseAnimations();
          } else {
            section.removeAttribute('data-inview');
            if (seam && seam.pauseAnimations) seam.pauseAnimations();
          }
        });
      }, { rootMargin: '10% 0px' }).observe(section);
    } else {
      section.setAttribute('data-inview', '');
    }

    // ---- power-on -------------------------------------------------------
    // Armed only when JS is present, so a failed script leaves the section
    // fully lit rather than invisible. Fires once.
    if (!reduced.matches && 'IntersectionObserver' in window) {
      section.setAttribute('data-boot', 'pending');
      var booted = false;
      var bootObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (booted || !en.isIntersecting) return;
          booted = true;
          section.setAttribute('data-boot', 'running');
          bootObs.disconnect();
          // hand the rail back to the scroll driver once the sequence lands
          setTimeout(function () {
            section.setAttribute('data-boot', 'done');
            apply();
          }, 1300);
        });
      }, { threshold: 0.3 });
      bootObs.observe(pin);

      // Failsafe: arming the boot sets the stage to opacity 0, so a stalled
      // observer would leave the section invisible. If it has not fired in
      // four seconds, light the section unconditionally.
      setTimeout(function () {
        if (!booted) {
          booted = true;
          bootObs.disconnect();
          section.setAttribute('data-boot', 'done');
          apply();
        }
      }, 4000);
    }

    measure();
    engage(0);
    apply();
  });

  /* ---- Power-up band: parallax plate + in-view idle loops ---------------
     The plate is 124% of the band and sits half its overhang high, so it can
     travel the whole range without exposing an edge. Only transform is
     touched, and only while the band is on screen — a scroll handler that
     measures and paints through a section nobody is looking at is the kind
     of cost that shows up as jank somewhere else entirely. */
  (function () {
    var band = document.querySelector('[data-powerup]');
    if (!band) return;

    var plate = band.querySelector('[data-parallax]');
    var inView = false;

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          inView = en.isIntersecting;
          if (inView) band.setAttribute('data-inview', '');
          else band.removeAttribute('data-inview');
          if (inView) place();
        });
      }, { rootMargin: '10% 0px' }).observe(band);
    } else {
      inView = true;
      band.setAttribute('data-inview', '');
    }

    // The allowed travel lives with the overhang it is paired with, in CSS.
    // Read once per layout rather than per frame: getComputedStyle in the
    // scroll path would cost more than everything else here put together.
    var up = 0.09, down = 0.23;
    function readTravel() {
      var cs = window.getComputedStyle(band);
      var u = parseFloat(cs.getPropertyValue('--bt-plate-up'));
      var d = parseFloat(cs.getPropertyValue('--bt-plate-down'));
      if (u) up = u;
      if (d) down = d;
    }

    function place() {
      if (!plate || reduced.matches) return;
      var r = band.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      // How far the band's centre sits from the viewport's, in half-screens.
      // Normalising by the viewport rather than by viewport + band matters:
      // this band sits near the foot of the page and never traverses a full
      // screen, so the wider denominator left most of the travel unused.
      var t = ((r.top + r.height / 2) - vh / 2) / (vh / 2);
      if (t > 1) t = 1; else if (t < -1) t = -1;
      // Asymmetric, matching the plate: entering from below it rides up to the
      // small overhang above, leaving it runs the long one below. The clamp is
      // what guarantees an edge can never come into frame.
      plate.style.transform =
        'translate3d(0,' + (t * r.height * (t >= 0 ? up : down)).toFixed(1) + 'px,0)';
    }

    var queued = false;
    function onScroll() {
      if (queued || !inView) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; place(); });
    }

    function onResize() { readTravel(); place(); }

    readTravel();

    if (reduced.matches) {
      if (plate) plate.style.transform = '';
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });
      // will-change is a standing cost, so it is only held while in view
      if (plate) plate.style.willChange = 'transform';
      place();
    }

    if (reduced.addEventListener) {
      reduced.addEventListener('change', function () {
        if (reduced.matches && plate) { plate.style.transform = ''; plate.style.willChange = ''; }
        else onResize();
      });
    }
  })();

  /* ---- Rail dots ---------------------------------------------------------
     One dot per application card, green on whichever card is in view. They
     are buttons, so they also jump the rail and take keyboard focus. Above
     the phone the CSS hides them, and the listeners cost nothing. */
  (function () {
    var dotWrap = document.querySelector('[data-dots]');
    var track = document.querySelector('.bt-apps');
    if (!dotWrap || !track) return;

    var dots = [].slice.call(dotWrap.querySelectorAll('.bt-dot'));
    var cards = [].slice.call(track.querySelectorAll('.bt-app'));
    if (!dots.length || dots.length !== cards.length) return;

    // Where a snapped card's left edge lands, in viewport coordinates.
    function originX() {
      return track.getBoundingClientRect().left +
             parseFloat(getComputedStyle(track).paddingLeft || 0);
    }

    function nearest() {
      var ref = originX(), best = 0, bestD = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(c.getBoundingClientRect().left - ref);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    function setCurrent(i) {
      dots.forEach(function (d, n) {
        if (n === i) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { setCurrent(nearest()); ticking = false; });
    }

    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        var delta = cards[i].getBoundingClientRect().left - originX();
        track.scrollBy({ left: delta, behavior: reduced.matches ? 'auto' : 'smooth' });
        setCurrent(i);
      });
    });

    setCurrent(nearest());
  })();

  /* ---- Form validation -------------------------------------------------- */
  var form = document.getElementById('demo-form');
  var panel = document.getElementById('form-panel');
  if (!form || !panel) return;

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var phoneRe = /^[0-9+()\s-]{6,}$/;
  var urlRe   = /^(https?:\/\/)?[^\s.\/]+(\.[^\s.\/]+)+(\/\S*)?$/i;

  function fieldOf(el) { return el.closest('.bt-field'); }

  function validate(el) {
    if (el.type === 'checkbox') return true;       // the opt-out is never required

    var f = fieldOf(el);
    var ok = true;

    if (el.type === 'radio') {
      // A radio is answered by its group, not by itself.
      var group = form.querySelectorAll('input[name="' + el.name + '"]');
      var required = false, checked = false;
      Array.prototype.forEach.call(group, function (r) {
        if (r.hasAttribute('required')) required = true;
        if (r.checked) checked = true;
      });
      ok = !required || checked;
      if (f) {
        f.classList.toggle('is-invalid', !ok);
        f.setAttribute('aria-invalid', ok ? 'false' : 'true');
      }
      return ok;
    }

    var v = el.value.trim();
    if (el.hasAttribute('required') && v === '') ok = false;
    else if (el.type === 'email' && v !== '' && !emailRe.test(v)) ok = false;
    else if (el.type === 'tel' && v !== '' && !phoneRe.test(v)) ok = false;
    else if (el.type === 'url' && v !== '' && !urlRe.test(v)) ok = false;
    if (f) f.classList.toggle('is-invalid', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  form.querySelectorAll('input, select').forEach(function (el) {
    if (el.name === 'hp_url') return;
    el.addEventListener('blur', function () { validate(el); });
    el.addEventListener('input', function () {
      var f = fieldOf(el);
      if (f && f.classList.contains('is-invalid')) validate(el);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (form.querySelector('[name="hp_url"]').value !== '') return; // honeypot

    var first = null;
    var valid = true;
    form.querySelectorAll('input, select').forEach(function (el) {
      if (el.name === 'hp_url') return;
      if (!validate(el)) { valid = false; if (!first) first = el; }
    });

    if (!valid) { if (first) first.focus(); return; }   // values are never cleared

    // Mockup only — the real build submits through the site's active form plugin.
    panel.innerHTML =
      '<div class="bt-confirm" role="status">' +
      '<div class="bt-confirm__mark"><svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">' +
      '<path d="M2 8.5 7 13.5 18 2.5" stroke="#0bc229" stroke-width="3"/></svg></div>' +
      '<p>Thanks — we\'ll be in touch within one business day to lock in a time.</p>' +
      '</div>';
    panel.querySelector('.bt-confirm').setAttribute('tabindex', '-1');
    panel.querySelector('.bt-confirm').focus();
  });
})();
