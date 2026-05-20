/**
 * SAM Booth Configurator — Framery-style accordion UI
 *
 * Data source: Payload CMS API.
 * PALETTES is populated at boot via fetchCatalogue() — see SamApp().
 */

/* ================================================================
   COLOUR PALETTES — hydrated from API at boot
   ================================================================ */
const PALETTES = {};

// Local-only swatch image overrides (interior PET fabric textures).
// Keyed by code; merged on top of API color data.
const LOCAL_SWATCH_IMAGES = {
  BWH: "assets/swatches/BWH.jpg",
  LTG: "assets/swatches/LTG.jpg",
  DKG: "assets/swatches/DKG.jpg",
  BUR: "assets/swatches/BUR.jpg",
  TAU: "assets/swatches/TAU.jpg",
  GRN: "assets/swatches/GRN.jpg",
  BLU: "assets/swatches/BLU.jpg"
};

// Convert a palette object into a swatch array.
//   codes        — whitelist: only these codes (in given order)
//   excludeCodes — blacklist: all codes except these
// If both are provided, whitelist wins.
function getPalette(paletteKey, codes, excludeCodes) {
  const palette = PALETTES[paletteKey];
  if (!palette) return [];
  let keys = (codes && codes.length) ? codes : Object.keys(palette);
  if (!codes && excludeCodes && excludeCodes.length) {
    keys = keys.filter(k => !excludeCodes.includes(k));
  }
  return keys.filter(k => palette[k]).map(k => ({ code: k, ...palette[k] }));
}

const PANEL_ICONS = {
  glass:       '<rect x="3" y="3" width="18" height="18" rx="2"/>',
  wall:        '<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity=".15"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  "glass-wall":'<rect x="12" y="3" width="9" height="18" rx="1" fill="currentColor" opacity=".15"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  "wall-glass":'<rect x="3" y="3" width="9" height="18" rx="1" fill="currentColor" opacity=".15"/><rect x="3" y="3" width="18" height="18" rx="2"/>'
};
PANEL_ICONS["2glass"] = PANEL_ICONS.glass;
PANEL_ICONS["2wall"]  = PANEL_ICONS.wall;

/* ================================================================
   SVG ICONS
   ================================================================ */
const ICON_CHECK = '<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
const ICON_CHEVRON_DOWN = '<svg class="h-5 w-5 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>';

/* ================================================================
   API CLIENT — fetches catalogue from Payload CMS
   ================================================================ */
async function fetchCatalogue(apiBase) {
  const [productsRes, colorsRes] = await Promise.all([
    fetch(`${apiBase}/api/products?depth=2&limit=100&sort=sortOrder`),
    fetch(`${apiBase}/api/colors?depth=1&limit=200&sort=sortOrder`)
  ]);
  if (!productsRes.ok) throw new Error(`Products fetch failed: ${productsRes.status}`);
  if (!colorsRes.ok)   throw new Error(`Colors fetch failed: ${colorsRes.status}`);
  const productsJson = await productsRes.json();
  const colorsJson   = await colorsRes.json();
  return { products: productsJson.docs, colors: colorsJson.docs };
}

// Build the PALETTES dictionary from the colors collection.
function buildPalettesFromApi(colors) {
  const out = {};
  for (const c of colors) {
    const paletteKey = (c.palette && c.palette.key) || null;
    if (!paletteKey) continue;
    if (!out[paletteKey]) out[paletteKey] = {};
    const entry = {
      name: c.name,
      bg: c.bgColor,
      border: c.borderColor || c.bgColor
    };
    if (LOCAL_SWATCH_IMAGES[c.code]) entry.swatch = LOCAL_SWATCH_IMAGES[c.code];
    out[paletteKey][c.code] = entry;
  }
  return out;
}

// Transform a Payload product doc into the in-memory shape the configurator expects.
function transformProduct(p) {
  const accessoryItems = (p.accessories || []).map(a => ({
    code: a.code,
    label: a.label,
    layerKey: a.layerKey,
    skuTemplate: a.skuTemplate,
    defaultColour: a.defaultColorCode,
    paletteKey: a.palette && a.palette.key,
    excludeCodes: (a.excludedColorCodes || []).map(x => x.code)
  }));
  const panelMissingInteriors = {};
  (p.panelRestrictions || []).forEach(r => {
    panelMissingInteriors[r.panelCode] = (r.excludedInteriorCodes || []).map(x => x.code);
  });
  return {
    key: p.slug,
    label: p.label,
    title: p.title,
    subtitle: p.subtitle || "",
    skuPrefix: p.skuPrefix,
    assetBase: p.assetBaseUrl,
    allGlassCode: p.allGlassCode,
    exteriorPaletteKey: p.exteriorPalette && p.exteriorPalette.key,
    interiorPaletteKey: p.interiorPalette && p.interiorPalette.key,
    layers: (p.layers || []).map(l => ({ key: l.key, folder: l.folder, zIndex: l.zIndex })),
    panels:  (p.panels  || []).map(pn => ({ code: pn.code, label: pn.label, icon: pn.icon })),
    accessories: accessoryItems.length ? { mode: "multi", items: accessoryItems } : undefined,
    panelMissingInteriors
  };
}

/* ================================================================
   APP WRAPPER
   ================================================================ */
function SamApp(appConfig) {
  const root = document.querySelector(appConfig.el);
  const apiBase = appConfig.apiBase || "http://localhost:3000";

  root.innerHTML = `
    <div style="min-height:60vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;color:#6b7280;font-family:system-ui,sans-serif">
      <svg class="animate-spin" style="height:32px;width:32px;color:#061629" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"></path></svg>
      <div style="font-size:14px">Loading catalogue…</div>
    </div>`;

  let products = [];
  let activeKey = "";

  fetchCatalogue(apiBase)
    .then(({ products: productDocs, colors }) => {
      // Hydrate PALETTES from API
      const built = buildPalettesFromApi(colors);
      Object.assign(PALETTES, built);
      // Transform products
      products = productDocs.map(transformProduct);
      if (!products.length) throw new Error("No products returned from API");
      activeKey = products[0].key;
      window._samSwitchTo = switchTo;
      switchTo(activeKey);
    })
    .catch(err => {
      console.error("[SamApp] Catalogue load failed:", err);
      root.innerHTML = `
        <div style="min-height:60vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0.5rem;color:#b91c1c;font-family:system-ui,sans-serif;text-align:center;padding:2rem">
          <div style="font-size:16px;font-weight:600">Unable to load configurator</div>
          <div style="font-size:13px;color:#6b7280">${String(err.message || err)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:0.5rem">Make sure the Payload backend is running at ${apiBase}</div>
        </div>`;
    });

  function switchTo(key) {
    activeKey = key;
    const config = products.find(p => p.key === key);
    renderConfigurator(config);
  }

  /* ==============================================================
     CONFIGURATOR
     ============================================================== */
  function renderConfigurator(config) {
    const subtitle = config.subtitle || "A self-contained individual studio space designed for private work in an open-plan workspace.";

    // ── Resolved palettes for this product ──
    const exteriorPalette = getPalette(config.exteriorPaletteKey || "exterior");
    const interiorPalette = getPalette("interior");

    // Pre-resolve accessory palettes (each item: { ...item, colours: [...] })
    if (config.accessories) {
      config.accessories.items.forEach(a => {
        a.colours = getPalette(a.paletteKey, a.colourCodes, a.excludeCodes);
      });
    }

    // ── State ──
    const state = {
      door:       "LT",
      exterior:   exteriorPalette[0].code,
      interior:   "BWH",
      panel:      config.panels[0].code
    };

    if (config.accessories) {
      state.accessories = {};
      state.accessoryColours = {};
      config.accessories.items.forEach(a => {
        state.accessories[a.code] = false;
        if (a.colours && a.colours.length) {
          state.accessoryColours[a.code] = a.defaultColour || a.colours[0].code;
        }
      });
    }

    // ── SKU builder ──
    function getSKUs() {
      const skus = {
        door:     `L1_DR_YY_${state.door}`,
        exterior: `L2_${config.skuPrefix}_NA_${state.exterior}`,
        interior: `L4_${config.skuPrefix}_NA_${state.interior}`,
        panel:    state.panel === config.allGlassCode
                    ? `L5_${config.allGlassCode}_000`
                    : `L5_${state.panel}_${state.interior}`
      };
      if (config.accessories) {
        config.accessories.items.forEach(acc => {
          if (!acc.layerKey) return;
          skus[acc.layerKey] = state.accessories[acc.code]
            ? acc.skuTemplate.replace("{colour}", state.accessoryColours[acc.code])
            : null;
        });
      }
      return skus;
    }

    const layerFolderMap = {};
    config.layers.forEach(l => { layerFolderMap[l.key] = l.folder; });

    // ── Render ──
    root.innerHTML = buildHTML();

    // ── DOM refs ──
    const layerEls = {};
    config.layers.forEach(l => {
      layerEls[l.key] = root.querySelector(`#layer-${l.key}`);
    });
    const placeholder  = root.querySelector("#img-placeholder");
    const exteriorSec  = root.querySelector('[data-row="exterior"]');
    const interiorSec  = root.querySelector('[data-row="interior"]');

    // ── Accordion logic ──
    root.querySelectorAll(".cfg-row-header").forEach(header => {
      header.addEventListener("click", () => {
        const row = header.closest(".cfg-row");
        const body = row.querySelector(".cfg-row-body");
        const chevron = header.querySelector(".chevron");
        const isOpen = !body.classList.contains("hidden");

        if (isOpen) {
          body.classList.add("hidden");
          if (chevron) chevron.style.transform = "";
          row.classList.remove("ring-2", "ring-[#061629]");
          row.classList.add("ring-1", "ring-gray-200");
        } else {
          body.classList.remove("hidden");
          if (chevron) chevron.style.transform = "rotate(180deg)";
          row.classList.remove("ring-1", "ring-gray-200");
          row.classList.add("ring-2", "ring-[#061629]");
        }
      });
    });

    // Section accordions
    root.querySelectorAll(".section-toggle").forEach(toggle => {
      toggle.addEventListener("click", () => {
        const section = toggle.closest(".cfg-section");
        const body = section.querySelector(".section-body");
        const chevron = toggle.querySelector(".section-chevron");
        const isOpen = !body.classList.contains("hidden");
        body.classList.toggle("hidden");
        chevron.style.transform = isOpen ? "" : "rotate(180deg)";
      });
    });

    // Helper: update row summary text
    function updateRowSummary(rowId, text) {
      const el = root.querySelector(`[data-row="${rowId}"] .row-value`);
      if (el) el.textContent = text;
    }

    // ── Image loading ──
    function loadLayer(key) {
      const skus = getSKUs();
      const sku  = skus[key];
      const img  = layerEls[key];
      if (!img) return;
      if (!sku) { img.src = ""; img.style.opacity = 0; return; }
      img.style.opacity = 0;
      img.src = `${config.assetBase}/${layerFolderMap[key]}/${sku}.png`;
      img.onload  = () => { img.style.opacity = 1; hidePlaceholder(); };
      img.onerror = () => { img.style.opacity = 0; };
    }

    function loadAllLayers() {
      Object.values(layerEls).forEach(img => { if (img) img.style.opacity = 0; });
      placeholder.classList.remove("hidden");
      const promises = config.layers.map(l => {
        const skus = getSKUs();
        const sku  = skus[l.key];
        const img  = layerEls[l.key];
        if (!img || !sku) return Promise.resolve();
        return new Promise(resolve => {
          img.style.opacity = 0;
          img.src = `${config.assetBase}/${layerFolderMap[l.key]}/${sku}.png`;
          img.onload  = () => { img.style.opacity = 1; resolve(); };
          img.onerror = () => { img.style.opacity = 0; resolve(); };
        });
      });
      Promise.all(promises).then(() => placeholder.classList.add("hidden"));
    }

    function hidePlaceholder() {
      if (Object.values(layerEls).some(img => img && img.style.opacity === "1")) {
        placeholder.classList.add("hidden");
      }
    }

    // ── Events: Swatches ──
    function setupSwatchRow(rowEl, stateKey, layerKey) {
           rowEl.addEventListener("click", e => {
        const btn = e.target.closest(".swatch");
        if (!btn) return;
        rowEl.querySelectorAll(".swatch").forEach(s => s.classList.remove("on"));
        btn.classList.add("on");
        state[stateKey] = btn.dataset.code;
        updateRowSummary(stateKey, btn.dataset.name);
        loadLayer(layerKey);
        // Also reload panel when interior changes (wall colour = interior colour)
        if (stateKey === "interior") loadLayer("panel");
      });
    }

    setupSwatchRow(exteriorSec, "exterior", "exterior");
    setupSwatchRow(interiorSec, "interior", "interior");

    // ── Events: Door Direction ──
    root.querySelectorAll(".door-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".door-btn").forEach(b => {
          b.classList.remove("ring-2", "ring-[#061629]", "bg-blue-50");
          b.classList.add("ring-1", "ring-gray-200");
        });
        btn.classList.remove("ring-1", "ring-gray-200");
        btn.classList.add("ring-2", "ring-[#061629]", "bg-blue-50");
        state.door = btn.dataset.code;
        updateRowSummary("door", btn.dataset.name);
        loadLayer("door");
      });
    });

    // ── Interior availability based on panel (e.g. WL_WL has no BUR) ──
    const panelMissingInteriors = config.panelMissingInteriors || {};

    function updateInteriorAvailability() {
      const missing = panelMissingInteriors[state.panel] || [];
      const swatches = interiorSec.querySelectorAll(".swatch");
      swatches.forEach(btn => {
        btn.classList.toggle("unavailable", missing.includes(btn.dataset.code));
      });
      // If current interior is now unavailable, fall back to BWH
      if (missing.includes(state.interior)) {
        swatches.forEach(s => s.classList.remove("on"));
        const fallback = interiorSec.querySelector('.swatch[data-code="BWH"]');
        if (fallback) fallback.classList.add("on");
        state.interior = "BWH";
        updateRowSummary("interior", "Blended White");
        loadLayer("interior");
      }
    }

    // ── Events: Back Panel ──
    root.querySelectorAll(".panel-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".panel-btn").forEach(b => {
          b.classList.remove("ring-2", "ring-[#061629]", "bg-blue-50");
          b.classList.add("ring-1", "ring-gray-200");
        });
        btn.classList.remove("ring-1", "ring-gray-200");
        btn.classList.add("ring-2", "ring-[#061629]", "bg-blue-50");
        state.panel = btn.dataset.panel;
        updateRowSummary("backpanel", btn.dataset.label);
        updateInteriorAvailability();
        loadLayer("panel");
      });
    });

    // Initial availability check
    updateInteriorAvailability();

    // ── Events: Accessories ──
    if (config.accessories) {
      root.querySelectorAll(".acc-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
          const acc = btn.dataset.acc;
          const isOn = !state.accessories[acc];
          state.accessories[acc] = isOn;

          // Update button UI
          const check = btn.querySelector(".acc-check");
          const label = btn.querySelector(".acc-status");
          if (isOn) {
            btn.classList.remove("ring-1", "ring-gray-200");
            btn.classList.add("ring-2", "ring-[#061629]", "bg-blue-50");
            if (check) check.classList.remove("hidden");
            if (label) label.textContent = "Added";
          } else {
            btn.classList.remove("ring-2", "ring-[#061629]", "bg-blue-50");
            btn.classList.add("ring-1", "ring-gray-200");
            if (check) check.classList.add("hidden");
            if (label) label.textContent = "Add +";
          }

          // Show/hide colour picker for this accessory
          const coloursEl = root.querySelector(`[data-acc-colours="${acc}"]`);
          if (coloursEl) coloursEl.classList.toggle("hidden", !isOn);

          const item = config.accessories.items.find(a => a.code === acc);
          if (item && item.layerKey) loadLayer(item.layerKey);
        });
      });

      // Colour swatch clicks for each accessory
      root.querySelectorAll("[data-acc-colours]").forEach(container => {
        const accCode = container.dataset.accColours;
        container.addEventListener("click", e => {
          const btn = e.target.closest(".acc-swatch");
          if (!btn) return;
          container.querySelectorAll(".acc-swatch").forEach(s => s.classList.remove("on"));
          btn.classList.add("on");
          state.accessoryColours[accCode] = btn.dataset.code;
          const label = container.querySelector(".acc-colour-label");
          if (label) label.textContent = btn.dataset.name;
          const item = config.accessories.items.find(a => a.code === accCode);
          if (item && item.layerKey) loadLayer(item.layerKey);
        });
      });
    }

    // ── Init ──
    loadAllLayers();

    /* ==============================================================
       HTML BUILDER
       ============================================================== */
    function buildHTML() {
      const doorName = "Left Handed";
      const extName  = exteriorPalette[0].name;
      const intName  = "Blended White";
      const panelName = config.panels[0].label;

      return `
  <header class="border-b border-gray-200 px-6 py-4">
    <nav class="mx-auto flex max-w-7xl items-center justify-between">
      <a href="/" class="text-xl font-bold">Koplus</a>
      <div class="flex gap-1 rounded-full bg-gray-100 p-1">
        ${products.map(p =>
          `<button onclick="_samSwitchTo('${p.key}')" class="rounded-full px-4 py-1.5 text-sm font-medium transition ${p.key === activeKey ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}">${p.label}</button>`
        ).join("\n        ")}
      </div>
    </nav>
  </header>

  <section class="px-4 py-10 md:py-14">
    <div class="w-full flex flex-col lg:flex-row gap-10">

      <!-- LEFT — Product image -->
      <div class="lg:w-3/5 lg:sticky lg:top-8 lg:self-start">
        <div id="pod-image" class="relative rounded-xl lg:rounded-2xl bg-gradient-to-b from-gray-50 to-white aspect-[4/3] overflow-hidden">
          ${config.layers.map(l =>
            `<img id="layer-${l.key}" class="absolute inset-0 h-full w-full object-contain transition-opacity duration-500" style="z-index:${l.zIndex}; opacity:0" src="" alt="${l.key} layer">`
          ).join("\n          ")}
          <div id="img-placeholder" class="absolute inset-0 flex items-center justify-center transition-opacity duration-300">
            <svg class="animate-spin h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"></path>
            </svg>
          </div>
        </div>
      </div>

      <!-- RIGHT — Config panel -->
      <div class="lg:w-2/5 flex flex-col gap-6">

        <!-- Title -->
        <div>
          <h1 class="text-2xl md:text-3xl font-bold" style="color:#0a2240">${config.title}</h1>
          <p class="text-sm text-gray-500 mt-1">${subtitle}</p>
        </div>

        <!-- Configure heading -->
        <div class="text-center text-xs font-semibold uppercase tracking-wider text-gray-400 border-b-2 border-[#061629] pb-2">Configure</div>

        <!-- ═══ Section: Setup ═══ -->
        <div class="cfg-section">
          <button class="section-toggle w-full flex items-center justify-between py-2">
            <h2 class="text-lg font-bold" style="color:#0a2240">Setup</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-3 pt-2">

            <!-- Door Direction -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="door">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Door orientation</div>
                  <div class="row-value text-xs text-gray-500">${doorName}</div>
                </div>
                <div class="flex items-center gap-2 text-[#061629] text-xs font-medium">
                  Included ${ICON_CHECK}
                </div>
              </button>
              <div class="cfg-row-body hidden px-4 pb-4">
                <div class="flex gap-3 pt-2">
                  <button data-code="LT" data-name="Left Handed" class="door-btn flex-1 rounded-lg ring-2 ring-[#061629] bg-blue-50 px-4 py-3 text-sm font-medium text-center transition">Left Handed</button>
                  <button data-code="RT" data-name="Right Handed" class="door-btn flex-1 rounded-lg ring-1 ring-gray-200 px-4 py-3 text-sm font-medium text-gray-600 text-center transition hover:ring-gray-400">Right Handed</button>
                </div>
              </div>
            </div>

            <!-- Back Panel -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="backpanel">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Back panel</div>
                  <div class="row-value text-xs text-gray-500">${panelName}</div>
                </div>
                <div class="flex items-center gap-2 text-[#061629] text-xs font-medium">
                  Included ${ICON_CHECK}
                </div>
              </button>
              <div class="cfg-row-body hidden px-4 pb-4">
                <div class="flex flex-wrap gap-2 pt-2">
                  ${config.panels.map((p, i) => {
                    const iconSvg = PANEL_ICONS[p.icon] || PANEL_ICONS.glass;
                    const isFirst = i === 0;
                    return `<button data-panel="${p.code}" data-label="${p.label}" class="panel-btn flex items-center gap-2 rounded-lg ${isFirst ? 'ring-2 ring-[#061629] bg-blue-50' : 'ring-1 ring-gray-200 hover:ring-gray-400'} px-3 py-2.5 text-sm font-medium transition">
                      <svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">${iconSvg}</svg>
                      ${p.label}
                    </button>`;
                  }).join("\n                  ")}
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ═══ Section: Color and Materials ═══ -->
        <div class="cfg-section">
          <button class="section-toggle w-full flex items-center justify-between py-2">
            <h2 class="text-lg font-bold" style="color:#0a2240">Color and materials</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-3 pt-2">

            <!-- Exterior Colour -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="exterior">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Exterior color</div>
                  <div class="row-value text-xs text-gray-500">${extName}</div>
                </div>
                <div class="flex items-center gap-2 text-[#061629] text-xs font-medium">
                  Included ${ICON_CHECK}
                </div>
              </button>
              <div class="cfg-row-body hidden px-4 pb-4">
                <div class="flex flex-wrap gap-2.5 pt-2">
                  ${renderSwatches(exteriorPalette, state.exterior)}
                </div>
              </div>
            </div>

            <!-- Interior Colour -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="interior">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Interior PET color</div>
                  <div class="row-value text-xs text-gray-500">${intName}</div>
                </div>
                <div class="flex items-center gap-2 text-[#061629] text-xs font-medium">
                  Included ${ICON_CHECK}
                </div>
              </button>
              <div class="cfg-row-body hidden px-4 pb-4">
                <div class="flex flex-wrap gap-2.5 pt-2">
                  ${renderSwatches(interiorPalette, "BWH")}
                </div>
              </div>
            </div>

          </div>
        </div>

        ${config.accessories ? `
        <!-- ═══ Section: Accessories ═══ -->
        <div class="cfg-section">
          <button class="section-toggle w-full flex items-center justify-between py-2">
            <h2 class="text-lg font-bold" style="color:#0a2240">Accessories</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-3 pt-2">
            ${config.accessories.items.map(a => `
            <div class="space-y-2">
              <button data-acc="${a.code}" class="acc-toggle w-full flex items-center justify-between rounded-xl ring-1 ring-gray-200 px-4 py-3 text-left transition hover:ring-gray-400">
                <div class="text-sm font-semibold text-gray-900">${a.label}</div>
                <div class="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <span class="acc-status">Add +</span>
                  <span class="acc-check hidden text-[#061629]">${ICON_CHECK}</span>
                </div>
              </button>
              ${a.colours && a.colours.length ? `
              <div class="acc-colours hidden pl-4 pt-1" data-acc-colours="${a.code}">
                <div class="text-xs text-gray-500 mb-2">Colour: <em class="acc-colour-label">${(a.colours.find(c => c.code === (a.defaultColour || a.colours[0].code)) || a.colours[0]).name}</em></div>
                <div class="flex flex-wrap gap-2.5">
                  ${a.colours.map(c => {
                    const on = c.code === (a.defaultColour || a.colours[0].code) ? " on" : "";
                    const unavailable = c.unavailable ? " unavailable" : "";
                    if (c.swatch && !c.unavailable) {
                      return `<button data-code="${c.code}" data-name="${c.name}" class="acc-swatch${on}${unavailable} h-8 w-8 rounded-full border-2 transition overflow-hidden" style="border-color:${c.border || c.bg}"><img src="${c.swatch}" alt="${c.name}" class="h-full w-full object-cover rounded-full"></button>`;
                    }
                    return `<button data-code="${c.code}" data-name="${c.name}" class="acc-swatch${on}${unavailable} h-8 w-8 rounded-full border-2 transition" style="background:${c.bg};border-color:${c.border || c.bg}"></button>`;
                  }).join("")}
                </div>
              </div>` : ''}
            </div>`).join("")}
          </div>
        </div>` : ''}

      </div>
    </div>
  </section>

  <footer class="border-t border-gray-200 px-6 py-6">
    <div class="mx-auto max-w-7xl text-center text-sm text-gray-500">
      &copy; 2026 Koplus. All rights reserved.
    </div>
  </footer>

  <style>
    .swatch, .acc-swatch { cursor:pointer; transition: transform 0.15s ease; }
    .swatch:hover, .acc-swatch:hover { transform: scale(1.08); }
    .swatch.on, .acc-swatch.on { box-shadow:0 0 0 2px #fff, 0 0 0 3px #061629; }
    .swatch.unavailable, .acc-swatch.unavailable {
      background: #d8d4cc !important;
      border-color: #bfb9ae !important;
      cursor: not-allowed;
      pointer-events: none;
      position: relative;
      overflow: hidden;
    }
    .swatch.unavailable img, .acc-swatch.unavailable img { display: none; }
    .swatch.unavailable::after, .acc-swatch.unavailable::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom right, transparent calc(50% - 1px), #8a8378 calc(50% - 1px), #8a8378 calc(50% + 1px), transparent calc(50% + 1px));
      border-radius: 50%;
    }
    .cfg-row-header:hover { background: #fafafa; }
    .cfg-row-body { animation: slideDown 0.25s ease; }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .cfg-section + .cfg-section { border-top: 1px solid #f3f4f6; padding-top: 1.25rem; }
    .section-chevron svg { transition: transform 0.2s ease; }
    #img-placeholder.hidden { display: flex !important; opacity: 0; pointer-events: none; }
  </style>`;
    }

    /* ── Render helpers ── */
    function renderSwatches(colours, defaultCode) {
      return colours.map(c => {
        const on = c.code === defaultCode ? " on" : "";
        const unavailable = c.unavailable ? " unavailable" : "";
        if (c.swatch && !c.unavailable) {
          return `<button data-code="${c.code}" data-name="${c.name}" class="swatch${on}${unavailable} h-9 w-9 rounded-full border-2 transition overflow-hidden" style="border-color:${c.border}">
            <img src="${c.swatch}" alt="${c.name}" class="h-full w-full object-cover rounded-full">
          </button>`;
        }
        return `<button data-code="${c.code}" data-name="${c.name}" class="swatch${on}${unavailable} h-9 w-9 rounded-full border-2 transition" style="background:${c.bg};border-color:${c.border}"></button>`;
      }).join("\n                  ");
    }
  }
}