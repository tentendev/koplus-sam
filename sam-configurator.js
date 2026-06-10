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

// Local-only swatch image overrides. Keyed by code; merged on top of API
// color data. Interior PET felt textures live in assets/swatches/; accessory
// upholstery (bench/sofa) woven textures live in assets/access-swatches/.
const LOCAL_SWATCH_IMAGES = {
  // Interior PET (felt)
  BWH: "assets/swatches/BWH.jpg",
  LTG: "assets/swatches/LTG.jpg",
  DKG: "assets/swatches/DKG.jpg",
  BUR: "assets/swatches/BUR.jpg",
  TAU: "assets/swatches/TAU.jpg",
  GRN: "assets/swatches/GRN.jpg",
  BLU: "assets/swatches/BLU.jpg",
  // Accessory upholstery (woven) — Flex Bench / Milli Sofa
  GYE: "assets/access-swatches/GYE.jpg",
  GPP: "assets/access-swatches/GPP.jpg",
  GGR: "assets/access-swatches/GGR.jpg",
  GDG: "assets/access-swatches/GDG.jpg",
  GDB: "assets/access-swatches/GDB.jpg",
  GLB: "assets/access-swatches/GLB.jpg",
  GRD: "assets/access-swatches/GRD.jpg",
  GBN: "assets/access-swatches/GBN.jpg"
};

// Local order overrides for a palette, by palette key. Codes listed here are
// reordered to this sequence; any codes not listed keep their API order at the
// end. Used to mirror the canonical Gabriel Medley swatch order from
// koplus.com/en/accessories/discuter-system (Slate Grey, Mocha Brown, Mustard
// Yellow, Scarlet Red, Fuchsia Purple, Indigo Blue, Sky Teal, Matcha Green).
const LOCAL_PALETTE_ORDER = {
  accUpholstery: ["GDG", "GBN", "GYE", "GRD", "GPP", "GDB", "GLB", "GGR"]
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
const ICON_CHEVRON_DOWN = '<svg class="h-5 w-5 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>';
const ICON_LOCK = '<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path stroke-linecap="round" d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

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
  // Apply any local order overrides (e.g. accUpholstery → koplus.com sequence).
  // Object key insertion order drives getPalette()'s default order.
  for (const key in LOCAL_PALETTE_ORDER) {
    if (!out[key]) continue;
    const reordered = {};
    LOCAL_PALETTE_ORDER[key].forEach(code => {
      if (out[key][code]) reordered[code] = out[key][code];
    });
    Object.keys(out[key]).forEach(code => {
      if (!(code in reordered)) reordered[code] = out[key][code];
    });
    out[key] = reordered;
  }
  return out;
}

// Derive layer stack from base + the product's accessories.
// Layers render bottom-to-top by zIndex.
function deriveLayers(accessories) {
  const layers = [
    { key: "panel",    folder: "panel",    zIndex: 1 },
    { key: "interior", folder: "interior", zIndex: 2 }
  ];
  (accessories || []).forEach(a => {
    if (a.layerKey) {
      layers.push({ key: a.layerKey, folder: "accessories", zIndex: 3 });
    }
  });
  layers.push({ key: "exterior", folder: "exterior", zIndex: 4 });
  layers.push({ key: "door",     folder: "frame",    zIndex: 5 });
  return layers;
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
    layers: deriveLayers(accessoryItems),
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

    // SAM Single: the Flex Desk is a standard feature, not an optional accessory.
    // It renders below Exterior Color and its surface colour is locked to the
    // exterior — White exterior → White desk, any other → Black desk.
    const deskItem = config.key === "single" && config.accessories
      ? config.accessories.items.find(a => a.layerKey === "accDesk")
      : null;
    const optionalAccessories = config.accessories
      ? config.accessories.items.filter(a => a !== deskItem)
      : [];

    function deskColour() {
      return state.exterior === "WH" ? "WH" : "BK";
    }
    function deskColourName(code) {
      const c = ((deskItem && deskItem.colours) || []).find(x => x.code === code);
      return c ? c.name : (code === "WH" ? "White" : "Black");
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
      // Desk is standard (always rendered) with its colour locked to the exterior.
      if (deskItem) {
        state.accessories[deskItem.code] = true;
        state.accessoryColours[deskItem.code] = deskColour();
      }
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
    const thumbEls = {};
    config.layers.forEach(l => {
      layerEls[l.key] = root.querySelector(`#layer-${l.key}`);
      thumbEls[l.key] = root.querySelector(`#thumb-${l.key}`);
    });
    const placeholder  = root.querySelector("#img-placeholder");
    const exteriorSec  = root.querySelector('[data-row="exterior"]');
    const interiorSec  = root.querySelector('[data-row="interior"]');
    const deskSec      = root.querySelector('[data-row="desk"]');

    // ── Accordion logic ──
    root.querySelectorAll(".cfg-row-header").forEach(header => {
      header.addEventListener("click", () => {
        const row = header.closest(".cfg-row");
        const body = row.querySelector(".cfg-row-body");
        const chevron = header.querySelector(".chevron");
        const isOpen = body.classList.contains("open");

        if (isOpen) {
          body.classList.remove("open");
          if (chevron) chevron.style.transform = "";
          row.classList.remove("ring-2", "ring-[#061629]");
          row.classList.add("ring-1", "ring-gray-200");
        } else {
          body.classList.add("open");
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
    // Preload + decode the affected layers off-screen, then swap them all
    // in place in a single frame. The old images stay visible until every
    // new one is decoded, so the switch is instant and the layers never
    // desync — no fade-out gap, no flicker.
    function loadLayers(keys) {
      const skus = getSKUs();
      const jobs = [];
      keys.forEach(key => {
        const img = layerEls[key];
        if (!img) return;
        const thumb = thumbEls[key];
        const sku = skus[key];
        if (!sku) {
          img.removeAttribute("src"); img.style.opacity = 0;
          if (thumb) { thumb.removeAttribute("src"); thumb.style.opacity = 0; }
          return;
        }
        const newSrc = `${config.assetBase}/${layerFolderMap[key]}/${sku}.png`;
        if (img.src === newSrc && img.style.opacity === "1") return;
        const preload = new Image();
        preload.src = newSrc;
        const decoded = preload.decode
          ? preload.decode().then(() => true, () => false)
          : new Promise(res => { preload.onload = () => res(true); preload.onerror = () => res(false); });
        jobs.push(decoded.then(ok => ({ img, thumb, newSrc, ok })));
      });
      if (!jobs.length) return;
      Promise.all(jobs).then(results => {
        results.forEach(({ img, thumb, newSrc, ok }) => {
          if (ok) img.src = newSrc;
          img.style.opacity = ok ? 1 : 0;
          if (thumb) {
            if (ok) { thumb.src = newSrc; thumb.style.opacity = 1; }
            else thumb.style.opacity = 0;
          }
        });
        hidePlaceholder();
      });
    }

    function loadLayer(key) { loadLayers([key]); }

    function loadAllLayers() {
      Object.values(layerEls).forEach(img => { if (img) img.style.opacity = 0; });
      Object.values(thumbEls).forEach(img => { if (img) img.style.opacity = 0; });
      placeholder.classList.remove("hidden");
      const promises = config.layers.map(l => {
        const skus = getSKUs();
        const sku  = skus[l.key];
        const img  = layerEls[l.key];
        const thumb = thumbEls[l.key];
        if (!img || !sku) return Promise.resolve();
        return new Promise(resolve => {
          img.style.opacity = 0;
          const url = `${config.assetBase}/${layerFolderMap[l.key]}/${sku}.png`;
          img.src = url;
          if (thumb) thumb.src = url;
          img.onload  = () => {
            img.style.opacity = 1;
            if (thumb) thumb.style.opacity = 1;
            resolve();
          };
          img.onerror = () => {
            img.style.opacity = 0;
            if (thumb) thumb.style.opacity = 0;
            resolve();
          };
        });
      });
      Promise.all(promises).then(() => {
        placeholder.classList.add("hidden");
        prefetchVariants();
      });
    }

    // Warm the browser cache with every colour / panel / accessory variant
    // so later swatch clicks resolve from cache and swap in with no delay.
    // Runs in the background after the initial booth has rendered.
    function prefetchVariants() {
      const urls = new Set();
      const add = (folder, sku) => { if (folder && sku) urls.add(`${config.assetBase}/${folder}/${sku}.png`); };

      ["LT", "RT"].forEach(c => add(layerFolderMap.door, `L1_DR_YY_${c}`));
      exteriorPalette.forEach(c => add(layerFolderMap.exterior, `L2_${config.skuPrefix}_NA_${c.code}`));
      interiorPalette.forEach(c => add(layerFolderMap.interior, `L4_${config.skuPrefix}_NA_${c.code}`));

      // Back panel walls take the interior colour, so prefetch every panel × interior combo.
      add(layerFolderMap.panel, `L5_${config.allGlassCode}_000`);
      config.panels.forEach(p => {
        if (p.code === config.allGlassCode) return;
        interiorPalette.forEach(c => add(layerFolderMap.panel, `L5_${p.code}_${c.code}`));
      });

      if (config.accessories) {
        config.accessories.items.forEach(acc => {
          if (!acc.layerKey || !acc.skuTemplate) return;
          (acc.colours || []).forEach(c =>
            add(layerFolderMap[acc.layerKey], acc.skuTemplate.replace("{colour}", c.code)));
        });
      }

      urls.forEach(url => { const img = new Image(); img.decoding = "async"; img.src = url; });
    }

    function hidePlaceholder() {
      if (Object.values(layerEls).some(img => img && img.style.opacity === "1")) {
        placeholder.classList.add("hidden");
      }
    }

    // Tint each upholstery swatch's ring to its fabric's own colour, sampled
    // from the image, so the border blends with the texture instead of showing
    // the flat catalogue colour. Same-origin images, so canvas reads are safe.
    function averageImageColour(img) {
      try {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 16;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
      } catch (e) {
        return null;
      }
    }

    // Sample each fabric swatch's average colour off-screen and use it as the
    // button's border so the ring blends with the texture. The swatch URL is
    // read from the inline background-image; we load a fresh Image() for
    // sampling — the browser dedupes the request via cache.
    function tintAccessorySwatchBorders() {
      root.querySelectorAll(".acc-swatch").forEach(btn => {
        const m = btn.style.backgroundImage.match(/url\(["']?([^"')]+)/);
        if (!m) return;
        const img = new Image();
        img.onload = () => {
          const colour = averageImageColour(img);
          if (colour) btn.style.borderColor = colour;
        };
        img.src = m[1];
      });
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
        // Interior colour also paints the back-panel walls — swap both
        // layers together so they never appear out of sync.
        if (stateKey === "interior") {
          loadLayers(["interior", "panel"]);
        } else if (stateKey === "exterior" && deskItem) {
          // Desk surface is locked to the exterior colour — rebind and swap together.
          applyDeskBinding();
          loadLayers(["exterior", "accDesk"]);
        } else {
          loadLayer(layerKey);
        }
      });
    }

    // Keep the locked desk surface in sync with the current exterior colour.
    function applyDeskBinding() {
      if (!deskItem) return;
      const code = deskColour();
      state.accessoryColours[deskItem.code] = code;
      updateRowSummary("desk", deskColourName(code));
      if (deskSec) {
        deskSec.querySelectorAll(".desk-swatch").forEach(s =>
          s.classList.toggle("on", s.dataset.code === code));
      }
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
        // updateInteriorAvailability may fall the interior back to BWH;
        // swap panel + interior together (the guard skips interior if unchanged).
        loadLayers(["panel", "interior"]);
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

          // Toggle wrapper border (matches the Exterior row pattern) + body open.
          const wrapper = btn.closest(".cfg-row");
          const label = btn.querySelector(".acc-status");
          const coloursEl = root.querySelector(`[data-acc-colours="${acc}"]`);
          if (isOn) {
            if (wrapper) {
              wrapper.classList.remove("ring-1", "ring-gray-200");
              wrapper.classList.add("ring-2", "ring-[#061629]", "bg-blue-50");
            }
            if (label) { label.textContent = "Added"; label.classList.add("font-bold", "text-[#061629]"); }
            if (coloursEl) coloursEl.classList.add("open");
          } else {
            if (wrapper) {
              wrapper.classList.remove("ring-2", "ring-[#061629]", "bg-blue-50");
              wrapper.classList.add("ring-1", "ring-gray-200");
            }
            if (label) { label.textContent = "Add +"; label.classList.remove("font-bold", "text-[#061629]"); }
            if (coloursEl) coloursEl.classList.remove("open");
          }

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

    // ── Sticky summary bar ──
    // Build a one-line summary of the current selections for the bottom bar.
    // Order mirrors the right-side selector top-to-bottom:
    // Door Orientation · Back Panel · Exterior Colour · Tabletop Colour · Interior PET Colour · Accessory.
    function buildSummaryText() {
      const parts = [];
      // Door Orientation
      parts.push(state.door === "LT" ? "Left-handed door" : "Right-handed door");
      // Back Panel
      const panel = config.panels.find(p => p.code === state.panel);
      if (panel) {
        const lbl = panel.label || "";
        parts.push(/\bback\b/i.test(lbl) ? lbl : `${lbl} back`);
      }
      // Exterior Colour
      const ext = exteriorPalette.find(c => c.code === state.exterior);
      if (ext) parts.push(`${ext.name} exterior`);
      // Tabletop Colour (standard Flex Desk — Single only)
      if (deskItem && state.accessories[deskItem.code]) {
        const code = state.accessoryColours[deskItem.code];
        const c = (deskItem.colours || []).find(x => x.code === code);
        const colourName = c ? c.name : "";
        parts.push(colourName ? `${colourName} laminate desk` : "Laminate desk");
      }
      // Interior PET Colour
      const intP = interiorPalette.find(c => c.code === state.interior);
      if (intP) parts.push(`${intP.name} interior`);
      // Accessory (optional add-ons)
      optionalAccessories.forEach(a => {
        if (!state.accessories[a.code]) return;
        const code = state.accessoryColours[a.code];
        const c = (a.colours || []).find(x => x.code === code);
        const colourName = c ? c.name : "";
        parts.push(colourName ? `${a.label} (${colourName})` : a.label);
      });
      return parts.join(" · ");
    }

    function updateSummary() {
      const el = root.querySelector("#summary-config");
      if (el) el.textContent = buildSummaryText();
    }

    // Single delegated listener: any interactive change in the configurator
    // triggers a summary refresh (deferred so per-handler state mutations run
    // first).
    root.addEventListener("click", e => {
      if (e.target.closest(".swatch, .acc-swatch, .door-btn, .panel-btn, .acc-toggle")) {
        setTimeout(updateSummary, 0);
      }
    });

    // Reset → re-render this product with default state.
    const resetBtn = root.querySelector("#btn-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => switchTo(config.key));

    // Quote → intentionally inert for now. Wire up to the real submission flow
    // (modal form + backend / Resend / HubSpot, etc.) once it's defined.

    // ── Init ──
    loadAllLayers();
    tintAccessorySwatchBorders();
    updateSummary();

    /* ==============================================================
       HTML BUILDER
       ============================================================== */
    function buildHTML() {
      const doorName = "Left Handed";
      const extName  = exteriorPalette[0].name;
      const intName  = "Blended White";
      const panelName = config.panels[0].label;
      // The big "SAM" series heading already brands the page, so drop any leading
      // "SAM " the CMS title carries — the product title reads e.g. "Large Acoustic Booth".
      const productTitle = config.title.replace(/^SAM\s+/i, "");

      return `
  <header class="border-b border-gray-200 px-6 py-4">
    <nav class="mx-auto flex max-w-7xl items-center">
      <a href="/" class="inline-flex items-center" aria-label="Koplus">
        <img src="assets/koplus-logo.png" alt="Koplus" class="h-8 w-auto">
      </a>
    </nav>
  </header>

  <section class="px-4 py-10 md:py-14">
    <div class="w-full flex flex-col lg:flex-row gap-10">

      <!-- LEFT — Product image -->
      <div class="lg:w-3/5 lg:sticky lg:top-8 lg:self-start">
        <div id="pod-image" class="relative rounded-xl lg:rounded-2xl bg-gradient-to-b from-gray-50 to-white aspect-[4/3] overflow-hidden">
          ${config.layers.map(l =>
            `<img id="layer-${l.key}" class="pod-layer absolute inset-0 h-full w-full object-contain" style="z-index:${l.zIndex}; opacity:0" src="" alt="${l.key} layer">`
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

        <!-- Series name — aligns with the top edge of the product image on the left. -->
        <div>
          <h1 class="font-['Cal_Sans'] text-[40px] md:text-[52px] lg:text-[64px] font-normal leading-[1.05]" style="color:#0a2240">SAM</h1>
          <p class="font-['Noto_Sans'] text-base font-light leading-snug mt-1.5" style="color:#5b6b7b">Sustainable Acoustic Modular Booth</p>
        </div>

        <!-- Product title — sits directly below the series tagline and updates with the
             selector. Title text is API-driven (config.title); per-size naming lives in CMS. -->
        <h2 class="font-['Noto_Sans'] text-[22px] md:text-[26px] lg:text-[30px] font-medium leading-[1.2]" style="color:#0a2240">${productTitle}</h2>

        <!-- Product selector (Single / Medium / Large) — compact pill with generous
             per-option padding so each segment (incl. the selected one) reads spacious. -->
        <div class="flex gap-1 rounded-full bg-gray-100 p-1.5 self-start">
          ${products.map(p =>
            `<button onclick="_samSwitchTo('${p.key}')" class="rounded-full px-7 py-2 text-sm font-medium transition ${p.key === activeKey ? 'bg-[#061629] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}">${p.label}</button>`
          ).join("\n          ")}
        </div>

        <!-- Product description (API-driven subtitle) — Noto Sans Light to match the tagline. -->
        <p class="font-['Noto_Sans'] text-lg font-light leading-[22px]" style="color:#5b6b7b">${subtitle}</p>

        <!-- Divider (replaces the former "Configure" heading). -->
        <div class="border-b border-gray-300"></div>

        <!-- ═══ Section: Setup ═══ -->
        <div class="cfg-section">
          <button class="section-toggle w-full flex items-center justify-between py-2">
            <h2 class="text-lg font-bold" style="color:#0a2240">Setup</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-4 pt-2">

            <!-- Door Direction -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="door">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Door Orientation</div>
                  <div class="row-value text-xs text-gray-500">${doorName}</div>
                </div>
              </button>
              <div class="cfg-row-body px-4">
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
                  <div class="text-sm font-semibold text-gray-900">Back Panel</div>
                  <div class="row-value text-xs text-gray-500">${panelName}</div>
                </div>
              </button>
              <div class="cfg-row-body px-4">
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
            <h2 class="text-lg font-bold" style="color:#0a2240">Colour Option</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-4 pt-2">

            <!-- Exterior Colour -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="exterior">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Exterior Colour</div>
                  <div class="row-value text-xs text-gray-500">${extName}</div>
                </div>
              </button>
              <div class="cfg-row-body px-4">
                <div class="flex flex-wrap gap-2.5 pt-2">
                  ${renderSwatches(exteriorPalette, state.exterior)}
                </div>
              </div>
            </div>
            ${renderDeskRow()}
            <!-- Interior Colour -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="interior">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Interior PET Colour</div>
                  <div class="row-value text-xs text-gray-500">${intName}</div>
                </div>
              </button>
              <div class="cfg-row-body px-4">
                <div class="flex flex-wrap gap-2.5 pt-2">
                  ${renderSwatches(interiorPalette, "BWH")}
                </div>
              </div>
            </div>

          </div>
        </div>

        ${optionalAccessories.length ? `
        <!-- ═══ Section: Accessories ═══ -->
        <div class="cfg-section">
          <button class="section-toggle w-full flex items-center justify-between py-2">
            <h2 class="text-lg font-bold" style="color:#0a2240">Accessory</h2>
            <span class="section-chevron text-gray-400 transition-transform" style="transform:rotate(180deg)">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="section-body space-y-4 pt-2">
            ${optionalAccessories.map(a => `
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden">
              <button data-acc="${a.code}" class="acc-toggle w-full flex items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50">
                <div class="text-sm font-semibold text-gray-900">${a.label}</div>
                <div class="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <span class="acc-status">Add +</span>
                </div>
              </button>
              ${a.colours && a.colours.length ? `
              <div class="cfg-row-body acc-colours px-4" data-acc-colours="${a.code}">
                <div class="text-xs text-gray-500 mb-2">Colour: <span class="acc-colour-label">${(a.colours.find(c => c.code === (a.defaultColour || a.colours[0].code)) || a.colours[0]).name}</span></div>
                <div class="flex flex-wrap gap-2.5">
                  ${a.colours.map(c => {
                    const on = c.code === (a.defaultColour || a.colours[0].code) ? " on" : "";
                    const unavailable = c.unavailable ? " unavailable" : "";
                    if (c.swatch && !c.unavailable) {
                      return `<button data-code="${c.code}" data-name="${c.name}" title="${c.name}" aria-label="${c.name}" class="acc-swatch${on}${unavailable} h-8 w-8 rounded-full border-2 transition" style="border-color:${c.border || c.bg};background-image:url('${c.swatch}')"></button>`;
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

  <!-- Spacer so page content can scroll clear of the fixed summary bar below. -->
  <div class="h-24"></div>

  <!-- Sticky bottom configuration summary bar -->
  <div id="cfg-summary-bar" class="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white" style="box-shadow:0 -2px 12px rgba(0,0,0,0.06)">
    <div class="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 py-3 flex items-center gap-4">
      <!-- Left: live product thumbnail + product / live summary -->
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div id="summary-thumb" class="hidden sm:block relative aspect-[4/3] h-12 rounded-md overflow-hidden shrink-0 ring-1 ring-gray-200 bg-gradient-to-b from-gray-50 to-white">
          ${config.layers.map(l =>
            `<img id="thumb-${l.key}" class="pod-layer absolute inset-0 h-full w-full object-contain" style="z-index:${l.zIndex}; opacity:0" src="" alt="">`
          ).join("")}
        </div>
        <div class="min-w-0 flex-1">
          <div id="summary-product" class="text-sm font-semibold text-gray-900 truncate">SAM ${productTitle}</div>
          <div id="summary-config" class="text-xs text-gray-500 truncate"></div>
        </div>
      </div>
      <!-- Right: secondary + primary actions -->
      <button id="btn-reset" type="button" class="shrink-0 text-sm font-medium text-gray-600 hover:text-gray-900 px-6 py-2 transition">Reset</button>
      <button id="btn-quote" type="button" class="shrink-0 inline-flex items-center gap-2 px-8 py-2.5 text-sm font-medium text-white rounded-full transition hover:opacity-90" style="background:#061629">
        Request a quote
        <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  </div>

  <style>
    .swatch, .acc-swatch { cursor:pointer; transition: transform 0.15s ease; }
    .swatch:hover, .acc-swatch:hover { transform: scale(1.08); }
    .swatch.on, .acc-swatch.on { box-shadow:0 0 0 2px #fff, 0 0 0 3px #061629; }
    /* Fabric swatch render: zoom the texture in place by sizing the background
       larger than the swatch and centering it. Same effect koplus.com uses. */
    .acc-swatch { background-size: 90px; background-position: 50%; background-repeat: no-repeat; }
    .desk-swatch { display:inline-block; cursor:not-allowed; }
    .desk-swatch.on { box-shadow:0 0 0 2px #fff, 0 0 0 3px #061629; }
    .desk-swatch:not(.on) { opacity:.3; }
    .swatch.unavailable, .acc-swatch.unavailable {
      background: #d8d4cc !important;
      border-color: #bfb9ae !important;
      cursor: not-allowed;
      pointer-events: none;
      position: relative;
      overflow: hidden;
    }
    .swatch.unavailable img { display: none; }
    .swatch.unavailable::after, .acc-swatch.unavailable::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom right, transparent calc(50% - 1px), #8a8378 calc(50% - 1px), #8a8378 calc(50% + 1px), transparent calc(50% + 1px));
      border-radius: 50%;
    }
    .cfg-row-header:hover { background: #fafafa; }
    /* Smooth expand/collapse for option-card bodies. Default collapsed: zero
       max-height + zero vertical padding; .open transitions to full height. */
    .cfg-row-body {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      padding-top: 0;
      padding-bottom: 0;
      transition: max-height .3s ease, opacity .25s ease, padding-top .3s ease, padding-bottom .3s ease;
    }
    .cfg-row-body.open {
      max-height: 800px;
      opacity: 1;
      padding-top: .5rem;
      padding-bottom: 1rem;
    }
    .cfg-section + .cfg-section { border-top: 1px solid #f3f4f6; padding-top: 1.25rem; }
    .section-chevron svg { transition: transform 0.2s ease; }
    #img-placeholder.hidden { display: flex !important; opacity: 0; pointer-events: none; }
    /* Source renders come in a touch dark — lift the composited product.
       Stop-gap until/unless Koplus re-exports brighter layers. Tune here. */
    .pod-layer { filter: brightness(1.15); }
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

    // Standard desk-surface row (Single only). Surface colour is locked to the
    // exterior, so the swatches are display-only (non-interactive <span>s).
    function renderDeskRow() {
      if (!deskItem) return "";
      const active = deskColour();
      const swatches = (deskItem.colours || []).map(c => {
        const on = c.code === active ? " on" : "";
        return `<span data-code="${c.code}" title="${c.name}" class="desk-swatch${on} h-9 w-9 rounded-full border-2" style="background:${c.bg};border-color:${c.border || c.bg}"></span>`;
      }).join("\n                  ");
      return `
            <!-- Desk surface (standard; surface colour locked to exterior) -->
            <div class="cfg-row rounded-xl ring-1 ring-gray-200 overflow-hidden" data-row="desk">
              <button class="cfg-row-header w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div class="text-sm font-semibold text-gray-900">Tabletop Colour</div>
                  <div class="row-value text-xs text-gray-500">${deskColourName(active)}</div>
                </div>
                <div class="flex items-center gap-1.5 text-gray-400 text-xs font-medium">
                  Auto ${ICON_LOCK}
                </div>
              </button>
              <div class="cfg-row-body px-4">
                <div class="flex flex-wrap gap-2.5 pt-2">
                  ${swatches}
                </div>
                <div class="text-xs text-gray-400 mt-2">Automatically matched to the exterior color — White exterior uses a white desk surface, all others use black.</div>
              </div>
            </div>`;
    }
  }
}