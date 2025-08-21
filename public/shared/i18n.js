// Internationalization helper (no framework, minimal footprint)
(function() {
  'use strict';
  
  const LANG_KEY = 'ssot.lang';
  const DEFAULT_LANG = 'es';
  const SUPPORTED_LANGS = ['es', 'en'];
  
  // Global i18n object
  window.i18n = {
    translations: {},
    currentLang: null,
    
    // Initialize i18n
    async init() {
      // Get saved language or detect from browser
      const savedLang = localStorage.getItem(LANG_KEY);
      const browserLang = navigator.language?.substring(0, 2).toLowerCase();
      const lang = savedLang || (SUPPORTED_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG);
      
      await this.setLanguage(lang, false);
      this.updateDOM();
      this.setupLanguageSelector();
    },
    
    // Load and set language
    async setLanguage(lang, updateDOM = true) {
      if (!SUPPORTED_LANGS.includes(lang)) {
        console.warn(`Language ${lang} not supported, falling back to ${DEFAULT_LANG}`);
        lang = DEFAULT_LANG;
      }
      
      try {
        const response = await fetch(`/i18n/${lang}.json`);
        if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
        
        this.translations = await response.json();
        this.currentLang = lang;
        localStorage.setItem(LANG_KEY, lang);
        
        // Update HTML lang attribute
        document.documentElement.lang = lang;
        
        if (updateDOM) {
          this.updateDOM();
          this.updateLanguageSelector();
        }
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('languagechange', { 
          detail: { lang, translations: this.translations } 
        }));
        
      } catch (error) {
        console.error('Failed to load language:', error);
        // Fallback to Spanish if loading fails
        if (lang !== DEFAULT_LANG) {
          await this.setLanguage(DEFAULT_LANG, updateDOM);
        }
      }
    },
    
    // Get translation by key (supports nested keys like "home.title")
    t(key, fallback = null) {
      const keys = key.split('.');
      let value = this.translations;
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return fallback || key;
        }
      }
      
      return value || fallback || key;
    },
    
    // Update all elements with data-i18n attribute
    updateDOM() {
      // Update text content
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = this.t(key);
        
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.placeholder = translation;
        } else {
          element.textContent = translation;
        }
      });
      
      // Update attributes (title, alt, aria-label)
      document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = this.t(key);
      });
      
      document.querySelectorAll('[data-i18n-alt]').forEach(element => {
        const key = element.getAttribute('data-i18n-alt');
        element.alt = this.t(key);
      });
      
      document.querySelectorAll('[data-i18n-aria]').forEach(element => {
        const key = element.getAttribute('data-i18n-aria');
        element.setAttribute('aria-label', this.t(key));
      });
    },
    
    // Setup language selector if exists
    setupLanguageSelector() {
      const selector = document.getElementById('langSelector');
      if (!selector) return;
      
      // Clear and populate options
      selector.innerHTML = '';
      SUPPORTED_LANGS.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang.toUpperCase();
        option.selected = lang === this.currentLang;
        selector.appendChild(option);
      });
      
      // Remove old listener and add new one
      selector.replaceWith(selector.cloneNode(true));
      const newSelector = document.getElementById('langSelector');
      
      newSelector.addEventListener('change', async (e) => {
        await this.setLanguage(e.target.value);
      });
    },
    
    // Update language selector to current language
    updateLanguageSelector() {
      const selector = document.getElementById('langSelector');
      if (selector) {
        selector.value = this.currentLang;
      }
    },
    
    // Format number with locale
    formatNumber(num, options = {}) {
      const locale = this.currentLang === 'en' ? 'en-US' : 'es-MX';
      return new Intl.NumberFormat(locale, options).format(num);
    },
    
    // Format currency
    formatCurrency(amount) {
      const locale = this.currentLang === 'en' ? 'en-US' : 'es-MX';
      const currency = this.currentLang === 'en' ? 'USD' : 'MXN';
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 2
      }).format(amount);
    },
    
    // Format date
    formatDate(date, options = {}) {
      const locale = this.currentLang === 'en' ? 'en-US' : 'es-MX';
      return new Intl.DateTimeFormat(locale, options).format(new Date(date));
    }
  };
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
  } else {
    i18n.init();
  }
})();