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

  /* ─── Toast ──────────────────────────────────────────── */
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3000);
  }

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

      // ── Success (Demo) ──
      // TODO: An Brevo-Formular-Endpunkt anbinden, sobald eingerichtet.
      // Bis dahin wird kein echter Versand ausgelöst.
      const source = (() => { try { return sessionStorage.getItem('cta_source') || 'direct'; } catch { return 'direct'; } })();
      const budget = document.getElementById('budget')?.value || '';

      console.log('[DDM Demo] Lead submitted:', {
        firstName: fnEl.value.trim(),
        company:   coEl.value.trim(),
        email:     emEl.value.trim(),
        budget,
        source,
      });

      // Show success state
      const globalEl = document.getElementById('formGlobal');
      if (globalEl) {
        globalEl.textContent = 'Vielen Dank! Wir prüfen Ihre Angaben und melden uns bei Ihnen.';
        globalEl.className = 'form-notice form-notice--success';
      }
      showToast('Anfrage erhalten – wir melden uns.');

      // Reset form
      form.reset();
      clearErrors();
      try { sessionStorage.removeItem('cta_source'); } catch (_) {}

      // Disable submit button briefly to prevent double-submit
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Gesendet ✓';
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Analyse anfragen';
        }, 5000);
      }
    });
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

  $$('.reveal').forEach(el => revealObserver.observe(el));

  /* ─── Reduced motion: disable animations ────────────────── */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('.reveal').forEach(el => el.classList.add('is-visible'));
  }

})();
