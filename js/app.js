// Shared utilities and navigation
(function () {
  const NAV = [
    { href: 'index.html', label: 'Home' },
    { href: 'materials.html', label: 'Materials' },
    { href: 'calculators.html', label: 'Calculators' },
    { href: 'standards.html', label: 'Standards' },
    { href: 'specifications.html', label: 'Specs & FEFCO' },
    { href: 'sustainability.html', label: 'Sustainability' }
  ];

  function buildTopbar() {
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const el = document.getElementById('topbar');
    if (!el) return;
    const nav = NAV.map(n => {
      const active = n.href === current ? ' active' : '';
      return `<a class="nav-link${active}" href="${n.href}">${n.label}</a>`;
    }).join('');
    el.innerHTML = `
      <a class="brand" href="index.html">
        <span class="brand-mark">PE</span>
        <span>Packaging Engineer Repository</span>
      </a>
      <nav class="nav">${nav}</nav>
    `;
  }

  function buildFooter() {
    const el = document.getElementById('footer');
    if (!el) return;
    el.innerHTML = `
      <div>Packaging Engineer Repository &middot; Open-source reference data for practicing packaging engineers.</div>
      <div style="margin-top:6px;font-size:12px;">Values shown are typical for engineering estimation. Always validate with material certifications and standard test methods before qualification.</div>
    `;
  }

  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  function fmt(n, d = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return '–';
    if (typeof n !== 'number') return n;
    if (!isFinite(n)) return '–';
    return Number(n.toFixed(d)).toLocaleString();
  }

  function byId(id) { return document.getElementById(id); }

  window.PE = { NAV, loadJSON, fmt, byId };

  document.addEventListener('DOMContentLoaded', () => {
    buildTopbar();
    buildFooter();
  });
})();
