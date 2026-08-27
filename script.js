/**
 * Data Driven Marketing – script.js
 * Clean, accessible, no dependencies.
 */

(function () {
  'use strict';

  /* ─── Utilities ──────────────────────────────────────── */

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }

  /* ─── Footer year ────────────────────────────────────── */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ─── Header: add shadow on scroll ──────────────────── */
  const header = document.getElementById('header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ─── Mobile menu ────────────────────────────────────── */
  const menuBtn  = $('.js-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-expanded', String(!isOpen));
      mobileMenu.classList.toggle('is-open', !isOpen);
    });

    // Close on mobile link click
    $$('a', mobileMenu).forEach(link => {
      link.addEventListener('click', () => {
        menuBtn.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('is-open');
      });
    });
  }

  /* ─── Smooth scroll for anchor links ─────────────────── */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update focus for accessibility
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  });

  /* ─── CTA buttons → scroll to form ──────────────────── */
  function scrollToForm(source) {
    // In production: replace with analytics event
    try { sessionStorage.setItem('cta_source', source); } catch (_) {}
    const form = document.getElementById('kontakt');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const first = document.getElementById('firstName');
      if (first) first.focus({ preventScroll: true });
    }, 500);
  }

  $$('.js-cta').forEach(btn => {
    btn.addEventListener('click', () => scrollToForm(btn.dataset.source || 'unknown'));
  });

  /* ─── Form validation ────────────────────────────────── */
  const form = document.getElementById('leadForm');
  if (form) {
    const fields = {
      firstName: { el: document.getElementById('firstName'), errId: 'error-firstName', label: 'Vorname' },
      company:   { el: document.getElementById('company'),   errId: 'error-company',   label: 'Firma' },
      email:     { el: document.getElementById('email'),     errId: 'error-email',      label: 'E-Mail-Adresse' },
      consent:   { el: document.getElementById('consent'),   errId: 'error-consent',    label: 'Einwilligung' },
    };

    function setFieldError(key, msg) {
      const { el, errId } = fields[key];
      const errEl = document.getElementById(errId);
      el.classList.toggle('is-invalid', !!msg);
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (errEl) {
        errEl.textContent = msg || '';
        errEl.setAttribute('aria-live', 'assertive');
      }
    }

    function clearErrors() {
      Object.keys(fields).forEach(k => setFieldError(k, ''));
      const global = document.getElementById('formGlobal');
      if (global) { global.textContent = ''; global.className = 'form-notice'; }
    }

    function validateEmail(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());
    }

    // Real-time validation on blur
    Object.keys(fields).forEach(key => {
      const { el } = fields[key];
      if (!el) return;
      el.addEventListener('blur', () => {
        if (key === 'email' && el.value.trim()) {
          if (!validateEmail(el.value)) setFieldError('email', 'Bitte eine gültige E-Mail-Adresse eingeben.');
          else setFieldError('email', '');
        } else if (key === 'consent') {
          if (!el.checked) setFieldError('consent', 'Bitte stimmen Sie der Datenverarbeitung zu.');
          else setFieldError('consent', '');
        } else if (el.value && !el.value.trim()) {
          setFieldError(key, `Bitte ${fields[key].label} eingeben.`);
        } else if (el.value.trim()) {
          setFieldError(key, '');
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Greift unabhängig vom Button-Zustand, etwa bei Enter im Textfeld.
      if (isSubmitting) return;
      clearErrors();

      let firstError = null;

      // Validate required fields
      const { el: fnEl } = fields.firstName;
      if (!fnEl.value.trim()) {
        setFieldError('firstName', 'Bitte Ihren Vornamen angeben.');
        firstError = firstError || fnEl;
      }

      const { el: coEl } = fields.company;
      if (!coEl.value.trim()) {
        setFieldError('company', 'Bitte Ihre Firma angeben.');
        firstError = firstError || coEl;
      }

      const { el: emEl } = fields.email;
      if (!emEl.value.trim()) {
        setFieldError('email', 'Bitte Ihre E-Mail-Adresse angeben.');
        firstError = firstError || emEl;
      } else if (!validateEmail(emEl.value)) {
        setFieldError('email', 'Bitte eine gültige E-Mail-Adresse eingeben.');
        firstError = firstError || emEl;
      }

      const { el: csEl } = fields.consent;
      if (!csEl.checked) {
        setFieldError('consent', 'Bitte stimmen Sie der Datenverarbeitung zu.');
        firstError = firstError || csEl;
      }

      if (firstError) {
        firstError.focus();
        return;
      }

      sendLead();
    });

    /* ─── Versand ──────────────────────────────────────────────────────
       Die Client-Validierung oben bleibt Komfort; verbindlich prüft der
       Worker. Adresse des Endpunkts steht ausschließlich im
       data-endpoint-Attribut des Formulars – wird sie später relativ,
       ändert sich hier nichts. */
    const submitBtn = form.querySelector('[type="submit"]');
    const submitLabel = submitBtn ? submitBtn.textContent : '';
    const globalEl = document.getElementById('formGlobal');
    let isSubmitting = false;

    function setNotice(text, kind) {
      if (!globalEl) return;
      globalEl.textContent = text;
      globalEl.className = kind ? 'form-notice form-notice--' + kind : 'form-notice';
    }

    function releaseButton() {
      isSubmitting = false;
      if (!submitBtn) return;
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = submitLabel;
    }

    function showFailure(message) {
      setNotice(message, 'error');
      releaseButton();
      // Fokus auf die Meldung, damit Screenreader-Nutzer sie sicher
      // erreichen – das aria-live allein setzt den Fokus nicht.
      if (globalEl) {
        globalEl.setAttribute('tabindex', '-1');
        globalEl.focus({ preventScroll: true });
        globalEl.addEventListener('blur', () => globalEl.removeAttribute('tabindex'), { once: true });
      }
    }

    /* Der Erfolgsfall ersetzt das Formular, statt eine Meldung darunter zu
       hängen. Ein geleertes Formular, das stehen bleibt, liest sich
       mehrdeutig und lädt zum zweiten Absenden ein. */
    function showSuccess() {
      const successEl = document.getElementById('formSuccess');
      const titleEl = document.getElementById('kontaktTitel');

      form.hidden = true;

      if (titleEl) titleEl.textContent = 'Anfrage eingegangen';

      // Auslöser für GA4 generate_lead und die Ads-Conversion im Tag Manager.
      // Ein Array-Push ist unabhängig von der Einwilligung unbedenklich; ob
      // daraus ein Tag feuert, entscheidet GTM anhand der Consent-Signale.
      //
      // Der Name lautet bewusst nicht form_submit. Das Google-Tag erkennt
      // Formularinteraktionen selbst und erhebt form_submit innerhalb der
      // Ereignisverarbeitung von GTM, ohne den Umweg über den dataLayer.
      // Ein Trigger auf form_submit feuerte deshalb auch bei jedem
      // gescheiterten Absendeversuch, und damit die Ads-Conversion.
      // Gemessen an einem leeren Formular: Validierung bricht ab, keine
      // Anfrage geht an den Server, das Ereignis kommt trotzdem.
      //
      // lead_submitted erhebt Google nirgends. Der Name steht hier und im
      // Trigger CE - lead_submitted und darf nur zusammen geändert werden.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'lead_submitted' });

      if (!successEl) return;
      successEl.classList.add('is-visible');

      // role="status" meldet den Text an, bewegt aber den Fokus nicht. Ohne
      // das Folgende bliebe der Fokus im ausgeblendeten Formular hängen.
      successEl.focus({ preventScroll: true });

      const card = successEl.closest('.surface') || successEl;
      card.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center',
      });
    }

    async function sendLead() {
      isSubmitting = true;
      setNotice('', null);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.textContent = 'Wird gesendet …';
      }

      const payload = {
        firstName: fields.firstName.el.value.trim(),
        company:   fields.company.el.value.trim(),
        email:     fields.email.el.value.trim(),
        budget:    document.getElementById('budget')?.value || '',
        // Honeypot: bei echten Nutzern immer leer, siehe index.html.
        website:   document.getElementById('website')?.value || '',
        consent:   fields.consent.el.checked,
        source:    (() => { try { return sessionStorage.getItem('cta_source') || 'direct'; } catch { return 'direct'; } })(),
      };

      try {
        const res = await fetch(form.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        let data = null;
        try { data = await res.json(); } catch (_) { /* Antwort ohne JSON-Body */ }

        if (res.ok && data && data.success) {
          clearErrors();
          try { sessionStorage.removeItem('cta_source'); } catch (_) {}
          showSuccess();
          return;
        }

        // Nur die Validierungsmeldung des Workers ist für Nutzer
        // formuliert. 404 und 405 sind technische Zustände, die im
        // Normalbetrieb nicht auftreten – dafür der allgemeine Text,
        // statt "Not found." anzuzeigen.
        showFailure(
          res.status === 400 && data && data.error
            ? data.error
            : 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut.'
        );
      } catch (_) {
        // Netzwerkfehler, abgebrochener Request oder blockierte Anfrage.
        showFailure('Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.');
      }
    }
  }

  /* ─── FAQ accordion (accessible) ───────────────────────── */
  $$('.faq__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      const panelId = btn.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);

      // Close all
      $$('.faq__btn').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        const p = document.getElementById(b.getAttribute('aria-controls'));
        if (p) p.classList.remove('is-open');
      });

      // Toggle clicked
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        if (panel) panel.classList.add('is-open');
      }
    });
  });

  /* ─── Reveal on scroll ──────────────────────────────────── */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  /* .reveal-seq nutzt denselben Observer: Beobachtet wird der Container,
     die Staffelung der Kinder regelt das CSS über --i. Kein zweiter
     Observer, keine Schleife über die Kinder. */
  $$('.reveal, .reveal-seq').forEach(el => revealObserver.observe(el));

  /* ─── Reduced motion: disable animations ────────────────── */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('.reveal, .reveal-seq').forEach(el => el.classList.add('is-visible'));
  }

  /* Sicherheitsnetz für beide Reveal-Varianten – gleiche Begründung wie
     beim Tippeffekt weiter unten: Ein IntersectionObserver meldet nichts,
     solange das Dokument verborgen ist (Hintergrundtab, per Mittelklick
     geöffneter Link). Genutzt wird die Mechanik derzeit nur auf
     marketing-audit.html, dort hängen Datenquellen und Journey daran und
     blieben unsichtbar. Nach drei Sekunden stehen sie in jedem Fall.
     Idempotent, kostet nichts, und der Normalfall bleibt der Observer.

     .reveal steht mit im Selektor, obwohl es aktuell keinen Verwender hat:
     Hero und Formular haben die Klasse verloren und zeichnen direkt mit dem
     CSS. Sollte sie wieder eingesetzt werden, ist sie damit von vornherein
     abgesichert. Für den ersten Bildschirm taugt das Netz allerdings nicht –
     drei Sekunden sind dort zu spät. Was oberhalb der Falz steht, darf keine
     Reveal-Klasse tragen. */
  setTimeout(() => {
    $$('.reveal, .reveal-seq').forEach(el => el.classList.add('is-visible'));
  }, 3000);

  /* ─── Hero-H1: Tippeffekt ─────────────────────────────────────────────
     Zeichenweise Einblendung statt animierter Breite: Jedes Zeichen steht
     von Anfang an an seiner endgültigen Position (kein Layoutsprung, kein
     nowrap nötig), nur die Deckkraft wird nacheinander umgeschaltet. Läuft
     einmal pro Sitzung und startet erst, wenn der Hero-Reveal durchgelaufen
     ist, damit nicht zwei Animationen gleichzeitig laufen. */
  (function setupHeroTyping() {
    const h1 = document.getElementById('hero-title');
    if (!h1 || !h1.classList.contains('js-type')) return;

    const STORAGE_KEY = 'ddm_hero_typed';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alreadyTyped = false;
    try { alreadyTyped = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (_) {}

    // In beiden Fällen bleibt der ursprüngliche Textknoten unangetastet
    // stehen – er ist bereits vollständig sichtbar.
    if (reduceMotion || alreadyTyped) return;

    const fullText = h1.textContent.replace(/\s+/g, ' ').trim();
    h1.setAttribute('aria-label', fullText);

    const container = document.createElement('span');
    container.setAttribute('aria-hidden', 'true');

    const cursor = document.createElement('span');
    cursor.className = 'type-cursor is-active';

    const chars = [];
    const words = fullText.split(' ');
    words.forEach((word, i) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'type-word';
      [...word].forEach(ch => {
        const charEl = document.createElement('span');
        charEl.className = 'type-char';
        charEl.textContent = ch;
        wordEl.appendChild(charEl);
        chars.push(charEl);
      });
      container.appendChild(wordEl);
      if (i < words.length - 1) {
        const spaceEl = document.createElement('span');
        spaceEl.className = 'type-char type-space';
        spaceEl.textContent = ' ';
        container.appendChild(spaceEl);
        chars.push(spaceEl);
      }
    });

    container.prepend(cursor);
    h1.textContent = '';
    h1.appendChild(container);

    const MS_PER_CHAR = 35; // 41 Zeichen ≈ 1,45s
    let started = false;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(failsafe);
      chars.forEach(c => c.classList.add('is-visible'));
      cursor.classList.remove('is-active');
      cursor.classList.add('is-done');
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }

    /* Sicherheitsnetz. requestAnimationFrame ruht, solange die Seite
       verborgen ist – etwa in einem per Mittelklick geöffneten
       Hintergrundtab. Ohne diese Absicherung blieben alle Zeichen auf
       opacity: 0 stehen und die Überschrift wäre dauerhaft leer. Nach
       spätestens vier Sekunden steht sie deshalb in jedem Fall. */
    const failsafe = setTimeout(finish, 4000);

    function runTyping() {
      if (started || finished) return;
      started = true;
      const start = performance.now();
      const total = chars.length;

      function tick(now) {
        if (finished) return;
        const shown = Math.min(total, Math.floor((now - start) / MS_PER_CHAR));
        for (let i = 0; i < shown; i++) {
          if (!chars[i].classList.contains('is-visible')) {
            chars[i].classList.add('is-visible');
            chars[i].after(cursor);
          }
        }
        if (shown < total) {
          requestAnimationFrame(tick);
        } else {
          finish();
        }
      }
      requestAnimationFrame(tick);
    }

    // Solange die Seite verborgen ist, würde rAF ohnehin nicht laufen –
    // also erst beim Sichtbarwerden starten.
    function startWhenVisible() {
      if (finished) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', startWhenVisible, { once: true });
        return;
      }
      runTyping();
    }

    // Erst nach dem Hero-Reveal starten (300ms-Übergang), mit
    // Sicherheitsnetz, falls transitionend aus irgendeinem Grund ausbleibt.
    const revealWrap = h1.closest('.reveal');
    if (revealWrap && !revealWrap.classList.contains('is-visible')) {
      revealWrap.addEventListener('transitionend', startWhenVisible, { once: true });
      setTimeout(startWhenVisible, 700);
    } else {
      startWhenVisible();
    }
  })();

})();
