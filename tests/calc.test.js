// Pruebas del motor de cálculo. Ejecutar:  node --test tests/calc.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\/ <ENGINE>[^\n]*\n([\s\S]*?)\/\/ <\/ENGINE>/);
assert.ok(m, 'No se encontró el bloque ENGINE en index.html');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + `
this.api = { getDefaultState, sanitizeState, calculate, computeAutoFillMl,
             iceGramsFor, iceBaseForCapacity, suggestDrinksPerGuest, PROFILES, RECIPES,
             TEMPLATES, staffSuggestion, applyTemplate, sanitizeStore, migrateLegacyState,
             mergeImportedEvents, computeBudget, makeEvent,
             calculateCanchero, makeMenuItem, defaultMenu, sanitizeMenuItem, MENU_KINDS,
             CATALOG, CATALOG_STATUS, filterCatalog, bottleKey, canMake, hardIngredients,
             makeBlankCocktail, makeGarnish, fruitParams, validFruitType,
             catalogToMenuItem, catalogToPrincipiante, buildMenuModel, menuIngredientName,
             scheduleInfo, makeCustomRecipe, applyCustomRecipe, sanitizeCustomRecipe, sanitizeCustomGarnish, sanitizeCustomList,
             suggestSoftBottles, buildGearList, buildShoppingList, sanitizeChecks, sanitizeGearExtra, sessionsSummary, daysUntil, historyOrder, inProgressSession, MUSIC_CHORDS, MUSIC_MELODY, midiToFreq };`, ctx);
const api = ctx.api;

// El motor se carga en un contexto aislado (vm): Node compara por referencia los arreglos y objetos que salen de él.
// Se compara por valor (JSON) para que deepStrictEqual se comporte igual que en el corredor del navegador.
const strictDeep = assert.deepStrictEqual;
assert.deepStrictEqual = (a, b, msg) => strictDeep(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

const base = (over = {}) => ({ ...api.getDefaultState(), ...over });
const plain = o => JSON.parse(JSON.stringify(o));
const team = (n, rate) => Array.from({ length: n }, () => ({ name: '', rate }));

test('hielo base: 40 g en 200 ml y 90 g en 550 ml (documentación)', () => {
    assert.strictEqual(api.iceGramsFor(200, 'normal'), 40);
    assert.strictEqual(api.iceGramsFor(550, 'normal'), 90);
});

test('niveles de hielo: Poco 0.7x, Full 1.35x', () => {
    assert.strictEqual(api.iceGramsFor(550, 'poco'), 65);   // 63 -> 65
    assert.strictEqual(api.iceGramsFor(550, 'full'), 120);  // 121.5 -> 120
});

test('total de tragos = invitados x tragos por invitado', () => {
    const r = api.calculate(base({ guests: 40, drinksPerGuest: 3 }));
    assert.strictEqual(r.totalDrinks, 120);
});

test('auto-completar: vaso - alcohol - hielo x 0.85, redondeado hacia abajo a 5 ml', () => {
    const s = base(); // gin 45 fijo, 350 ml, 60 g hielo -> 350-45-51 = 254 -> 250
    assert.strictEqual(api.computeAutoFillMl(s), 250);
});

test('auto-completar: varios ingredientes se reparten el espacio (no se duplica)', () => {
    const s = base({
        ingredients: [
            { name: 'A', pourMl: 50, autoFill: false, bottleMl: 750, price: 1, abv: 0 },
            { name: 'B', pourMl: 0, autoFill: true, bottleMl: 1000, price: 1, abv: 0 },
            { name: 'C', pourMl: 0, autoFill: true, bottleMl: 1000, price: 1, abv: 0 }
        ]
    });
    // libre = 350-50-51 = 249 -> 124.5 c/u -> 120
    assert.strictEqual(api.computeAutoFillMl(s), 120);
    const r = api.calculate(s);
    assert.ok(r.totalLiquidPerGlass + 51 <= 350);
});

test('auto-completar nunca da negativo (vaso lleno de hielo)', () => {
    const s = base({ glassCapacity: 100, iceGrams: 500 });
    assert.strictEqual(api.computeAutoFillMl(s), 0);
    assert.strictEqual(api.calculate(s).glass.autoOverflow, true);
});

test('botellas = techo(total ml / capacidad)', () => {
    const s = base({
        guests: 40, drinksPerGuest: 3,
        ingredients: [{ name: 'Gin', pourMl: 45, autoFill: false, bottleMl: 750, price: 1000, abv: 40 }]
    });
    const r = api.calculate(s); // 120 x 45 = 5400 ml -> 7.2 -> 8
    assert.strictEqual(r.computedIngredients[0].bottlesToBuy, 8);
    assert.strictEqual(r.computedIngredients[0].subtotal, 8000);
});

test('botellas: un multiplo exacto no suma una botella de mas', () => {
    const s = base({
        guests: 50, drinksPerGuest: 1, // 50 x 30 ml = 1500 ml = 2 botellas de 750
        ingredients: [{ name: 'X', pourMl: 30, autoFill: false, bottleMl: 750, price: 1, abv: 0 }]
    });
    assert.strictEqual(api.calculate(s).computedIngredients[0].bottlesToBuy, 2);
});

test('colchon de botellas del perfil real agrega botellas', () => {
    const s = base({
        guests: 50, drinksPerGuest: 1, bottleBufferPct: 8,
        ingredients: [{ name: 'X', pourMl: 30, autoFill: false, bottleMl: 750, price: 1, abv: 0 }]
    });
    assert.strictEqual(api.calculate(s).computedIngredients[0].bottlesToBuy, 3);
});

test('hielo de servicio = tragos x g / 1000 x merma, en bolsas + conservadora', () => {
    const s = base({ guests: 40, drinksPerGuest: 3, iceGrams: 60, thermalFactor: 1.15, iceBagKg: 5, coolerBags: 2 });
    const r = api.calculate(s); // 120x60/1000 = 7.2 kg x1.15 = 8.28 -> 2 bolsas
    assert.strictEqual(r.ice.serviceBags, 2);
    assert.strictEqual(r.ice.totalIceBags, 4);
    assert.strictEqual(r.ice.totalIceKgBought, 20);
});

test('cristaleria = invitados x rotacion x (1 + rotura)', () => {
    const s = base({ vesselMode: 'glassware', guests: 100, glassRotation: 1.5, breakagePct: 10 });
    assert.strictEqual(api.calculate(s).vessel.totalUnits, 165);
});

test('descartables = tragos x (75% + 15%) = 0.90x, en packs', () => {
    const s = base({ vesselMode: 'disposable', guests: 100, drinksPerGuest: 3, cupUsagePct: 75, cupSafetyPct: 15, cupPackQty: 50 });
    const r = api.calculate(s); // 300 x 0.90 = 270 -> 6 packs de 50
    assert.strictEqual(r.vessel.totalUnits, 270);
    assert.strictEqual(r.vessel.packsToBuy, 6);
});

test('citricos: rodajas -> frutas enteras -> kg por peso unitario', () => {
    const s = base({ guests: 40, drinksPerGuest: 3, fruitType: 'Limas', slicesPerDrink: 2, slicesPerFruit: 8, fruitWeightG: 80, fruitPriceKg: 1000 });
    const c = api.calculate(s).citrus; // 240 rodajas -> 30 frutas -> 2.4 kg
    assert.strictEqual(c.totalSlices, 240);
    assert.strictEqual(c.fruitsNeeded, 30);
    assert.ok(Math.abs(c.kgNeeded - 2.4) < 1e-9);
    assert.ok(Math.abs(c.cost - 2400) < 1e-6);
});

test('sin guarnicion no genera citricos', () => {
    assert.strictEqual(api.calculate(base({ fruitType: 'Sin guarnición' })).citrus, null);
});

test('margen: markup 30% sobre costo vs margen 30% sobre venta', () => {
    const a = api.calculate(base({ profitMarginPct: 30, marginMode: 'markup' })).budget;
    assert.ok(Math.abs(a.priceNet - a.totalCost * 1.3) < 1e-6);
    assert.ok(Math.abs(a.realMarginPct - 23.0769) < 0.01);
    const b = api.calculate(base({ profitMarginPct: 30, marginMode: 'margin' })).budget;
    assert.ok(Math.abs(b.priceNet - b.totalCost / 0.7) < 1e-6);
    assert.ok(Math.abs(b.realMarginPct - 30) < 1e-6);
});

test('margen sobre venta nunca divide por cero (tope 90%)', () => {
    const b = api.calculate(base({ profitMarginPct: 150, marginMode: 'margin' })).budget;
    assert.ok(Number.isFinite(b.finalClientPrice));
    assert.strictEqual(b.marginPct, 90);
});

test('otros costos e IVA entran en el precio final', () => {
    const b = api.calculate(base({ otherCosts: 10000, ivaPct: 21, profitMarginPct: 0 })).budget;
    assert.ok(Math.abs(b.totalCost - (b.supplyCost + 10000)) < 1e-6);
    assert.ok(Math.abs(b.finalClientPrice - b.totalCost * 1.21) < 1e-6);
});

test('entradas invalidas no producen NaN', () => {
    const s = api.sanitizeState({ guests: 'abc', drinksPerGuest: -5, ingredients: [{ name: 5, pourMl: 'x' }], glassId: 'nope' });
    const r = api.calculate(s);
    for (const v of [r.totalDrinks, r.budget.totalCost, r.budget.finalClientPrice, r.glass.abvPct]) {
        assert.ok(Number.isFinite(v), 'resultado no finito: ' + v);
    }
});

test('sanitizeState tolera null, basura y estados viejos', () => {
    assert.deepStrictEqual(plain(api.sanitizeState(null)), plain(api.getDefaultState()));
    assert.doesNotThrow(() => api.sanitizeState('x'));
    assert.doesNotThrow(() => api.sanitizeState({ ingredients: 'no' }));
});

test('graduacion final aprox. del Gin Tonic base es razonable', () => {
    const r = api.calculate(base());
    assert.ok(r.glass.abvPct > 3 && r.glass.abvPct < 15, 'ABV ' + r.glass.abvPct);
});

test('tragos sugeridos: 4 h publico mixto = 5', () => {
    assert.strictEqual(api.suggestDrinksPerGuest(4, 1), 5);
});

test('perfil real cambia desplazamiento, borde y colchon', () => {
    assert.deepStrictEqual(plain(api.PROFILES.real), { iceMlPerGram: 1, headspaceMl: 15, bottleBufferPct: 8 });
});

test('todas las recetas generan resultados finitos y no desbordan el vaso', () => {
    const caps = { rocks: 250, highball: 350, pint: 470, balloon: 550 };
    for (const [key, rec] of Object.entries(api.RECIPES)) {
        const cap = caps[rec.glassId];
        const s = base({
            glassId: rec.glassId, glassCapacity: cap, iceGrams: api.iceGramsFor(cap, 'normal'),
            ingredients: rec.ingredients.map((x, i) => ({ id: 'i' + i, ...x }))
        });
        const r = api.calculate(s);
        assert.ok(Number.isFinite(r.budget.totalCost), key);
        assert.ok(r.glass.occupiedMl <= cap + 1e-9 || !s.ingredients.some(i => i.autoFill), key + ' desborda');
    }
});

// ---------------- v3 ----------------

test('personal sugerido: 1 bartender cada 50, ayudante cada 2, estacion cada 100', () => {
    assert.deepStrictEqual(plain(api.staffSuggestion(40, 4)), { bartenders: 1, helpers: 0, stations: 1, totalPeople: 1, hours: 4 });
    const s = api.staffSuggestion(100, 4);
    assert.deepStrictEqual([s.bartenders, s.helpers, s.stations], [2, 1, 1]);
    const t = api.staffSuggestion(250, 4);
    assert.deepStrictEqual([t.bartenders, t.helpers, t.stations], [5, 3, 3]);
});

test('costo de personal = personas x horas x pago, y entra en el total', () => {
    const b = api.calculate(base({ guests: 100, eventHours: 4, staffList: team(3, 5000) })).budget;
    assert.strictEqual(b.staffCost, 60000);
    assert.ok(Math.abs(b.totalCost - (b.supplyCost + b.otherCosts + 60000)) < 1e-6);
    assert.strictEqual(api.calculate(base()).budget.staffCost, 0);
});

test('sena = porcentaje del precio final', () => {
    const r = api.calculate(base({ depositPct: 30 })).budget;
    assert.ok(Math.abs(r.depositAmount - r.finalClientPrice * 0.3) < 1e-6);
});

test('plantillas: cargan invitados, duracion y logistica y dan resultados finitos', () => {
    for (const [id, t] of Object.entries(api.TEMPLATES)) {
        const s = api.applyTemplate(base(), id);
        assert.strictEqual(s.guests, t.guests, id);
        assert.strictEqual(s.eventHours, t.eventHours, id);
        assert.strictEqual(s.vesselMode, t.vesselMode, id);
        assert.strictEqual(s.drinksPerGuest, api.suggestDrinksPerGuest(t.eventHours, t.audienceFactor), id);
        assert.ok(Number.isFinite(api.calculate(s).budget.totalCost), id);
    }
    assert.strictEqual(api.applyTemplate(base(), 'inexistente').guests, 40);
});

test('almacen: vacio da un evento activo; basura se sanea', () => {
    const empty = api.sanitizeStore(null);
    assert.strictEqual(empty.events.length, 1);
    assert.strictEqual(empty.activeId, empty.events[0].id);
    const bad = api.sanitizeStore({
        events: [{ id: 'a', name: 'X'.repeat(200), date: 'no', state: { guests: 'zz' } }, { id: 'a', name: 'dup' }, null, 5],
        activeId: 'nope'
    });
    assert.strictEqual(new Set(bad.events.map(e => e.id)).size, bad.events.length);
    assert.strictEqual(bad.events[0].name.length, 60);
    assert.strictEqual(bad.events[0].date, '');
    assert.ok(bad.events.some(e => e.id === bad.activeId));
    assert.strictEqual(api.sanitizeStore({ events: Array.from({ length: 80 }, () => ({})) }).events.length, 50);
});

test('migracion: el guardado de la v2 pasa a ser el primer evento', () => {
    const mig = api.migrateLegacyState({ guests: 77, drinksPerGuest: 4 });
    assert.strictEqual(mig.events.length, 1);
    assert.strictEqual(mig.events[0].state.guests, 77);
    assert.strictEqual(mig.events[0].name, 'Evento 1');
});

test('importar respaldo: suma eventos sin pisar los existentes', () => {
    const store = api.sanitizeStore(null);
    const one = api.mergeImportedEvents(store, { events: [{ id: 'x1', name: 'Importado', state: { guests: 5 } }] });
    assert.strictEqual(one.added, 1);
    assert.strictEqual(one.store.events.length, 2);
    const again = api.mergeImportedEvents(one.store, { events: [{ id: 'x1', name: 'Otra vez', state: {} }] });
    assert.strictEqual(again.store.events.length, 3);
    assert.strictEqual(new Set(again.store.events.map(e => e.id)).size, 3);
    assert.strictEqual(api.mergeImportedEvents(store, { foo: 1 }).added, 0);
    assert.strictEqual(api.mergeImportedEvents(store, null).added, 0);
});

// ---------------- El Canchero: Task 1 (nivel por evento y presupuesto compartido) ----------------

test('presupuesto compartido: computeBudget reproduce el presupuesto de calculate', () => {
    const s = base();
    const r = api.calculate(s);
    const supply = r.computedIngredients.reduce((a, i) => a + i.subtotal, 0)
        + r.ice.cost + (r.citrus ? r.citrus.cost : 0) + r.vessel.cost + (r.extras ? r.extras.cost : 0);
    const b = api.computeBudget(s, supply, r.guests, r.totalDrinks, r.staff);
    assert.deepStrictEqual(plain(b), plain(r.budget));
    assert.ok(Math.abs(r.budget.totalCost - supply) < 1e-6);
    assert.ok(Math.abs(r.budget.finalClientPrice - supply * 1.3) < 1e-6);
});

test('evento sin level se abre como principiante', () => {
    const st = api.sanitizeStore({ events: [{ id: 'a', state: {} }] });
    assert.strictEqual(st.events[0].level, 'principiante');
});

test('level invalido cae a principiante', () => {
    const st = api.sanitizeStore({ events: [{ id: 'a', level: 'x', state: {} }] });
    assert.strictEqual(st.events[0].level, 'principiante');
});

test('makeEvent acepta el nivel canchero y lo conserva al sanear', () => {
    const ev = api.makeEvent('X', {}, 'canchero');
    assert.strictEqual(ev.level, 'canchero');
    const st = api.sanitizeStore({ events: [ev] });
    assert.strictEqual(st.events[0].level, 'canchero');
});

test('respaldo sin level se importa como principiante', () => {
    const r = api.mergeImportedEvents(api.sanitizeStore(null), { events: [{ id: 'z', name: 'Viejo', state: {} }] });
    assert.strictEqual(r.store.events[1].level, 'principiante');
});

test('menu corrupto se sanea a arreglo vacio', () => {
    assert.deepStrictEqual(plain(api.sanitizeState({ menu: 'no' }).menu), []);
    assert.deepStrictEqual(plain(api.sanitizeState({ menu: [5, null] }).menu), []);
    assert.deepStrictEqual(plain(api.sanitizeState({}).menu), []);
});

// ---------------- El Canchero: Task 2 (carta mixta y calculateCanchero) ----------------

const item = (kind, recipe, share, over = {}) => ({ ...api.makeMenuItem(kind, recipe), sharePct: share, ...over });
const cstate = (menu, over = {}) => base({ guests: 100, drinksPerGuest: 3, menu, ...over });
const rowByName = (res, name) => res.purchases.filter(p => p.name.trim().toLowerCase() === name);

test('canchero: unir compras de un mismo ingrediente entre tragos', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 50), item('cocktail', 'negroni', 50)]));
    assert.strictEqual(r.totalTragos, 300);
    const gin = rowByName(r, 'gin (botella)');
    assert.strictEqual(gin.length, 1);
    assert.strictEqual(gin[0].bottles, 15); // 150x45 + 150x30 = 11250 ml / 750
    assert.deepStrictEqual(plain(gin[0].uses), [{ itemName: 'Gin Tonic', ml: 6750 }, { itemName: 'Negroni', ml: 4500 }]);
});

test('canchero: la carta que no suma 100% se normaliza y avisa', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 40), item('cocktail', 'negroni', 30)]));
    assert.strictEqual(r.shareWarning, true);
    assert.strictEqual(r.shareTotal, 70);
    assert.ok(Math.abs(r.items[0].drinks - 300 * 40 / 70) < 1e-9);
    assert.ok(Math.abs(r.items[1].drinks - 300 * 30 / 70) < 1e-9);
    assert.ok(Number.isFinite(r.budget.totalCost));
    const ok100 = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 60), item('cocktail', 'negroni', 40)]));
    assert.strictEqual(ok100.shareWarning, false);
});

test('canchero: carta vacia o todo en 0% no rompe', () => {
    for (const menu of [[], [item('cocktail', 'gin-tonic', 0), item('beer', null, 0)]]) {
        const r = api.calculateCanchero(cstate(menu));
        assert.strictEqual(r.totalTragos, 300);
        assert.ok(r.items.every(i => i.drinks === 0));
        assert.strictEqual(r.purchases.length, 0);
        assert.ok(Number.isFinite(r.budget.totalCost));
        assert.ok(Number.isFinite(r.budget.finalClientPrice));
    }
});

test('canchero: une por nombre normalizado y envase, no por nombre solo', () => {
    const mk = (name, bottleMl) => item('soft', null, 30, {
        ingredients: [{ name, pourMl: 30, autoFill: false, bottleMl, price: 100, abv: 0 }]
    });
    const r = api.calculateCanchero(cstate([mk('GIN ', 750), mk('gin', 750), mk('gin', 1000)]));
    const gin = rowByName(r, 'gin');
    assert.strictEqual(gin.length, 2);
    assert.deepStrictEqual(gin.map(g => g.bottleMl).sort((a, b) => a - b), [750, 1000]);
});

test('canchero: el item sin vaso (lata) no suma vasos', () => {
    const menu = [item('cocktail', 'gin-tonic', 50), item('cocktail', 'negroni', 30), item('beer', null, 20)];
    const r = api.calculateCanchero(cstate(menu, { vesselMode: 'glassware', glassRotation: 1.5, breakagePct: 10 }));
    const g = Object.fromEntries(r.vessels.groups.map(x => [x.glassId, x.units]));
    assert.deepStrictEqual(g, { highball: 83, rocks: 50 });
    assert.strictEqual(r.vessels.totalUnits, 133);
});

test('canchero: descartables por tragos con vaso, en packs', () => {
    const menu = [item('cocktail', 'gin-tonic', 80), item('beer', null, 20)];
    const r = api.calculateCanchero(cstate(menu, { vesselMode: 'disposable', cupUsagePct: 75, cupSafetyPct: 15, cupPackQty: 50 }));
    assert.strictEqual(r.vessels.totalUnits, 216);
    assert.strictEqual(r.vessels.packsToBuy, 5);
});

test('canchero: hielo de servicio solo cuenta items con hielo; la cerveza no suma', () => {
    const onlyBeer = api.calculateCanchero(cstate([item('beer', null, 100)]));
    assert.strictEqual(onlyBeer.ice.serviceBags, 0);
    const mix = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 50), item('beer', null, 50)], { thermalFactor: 1.15, iceBagKg: 5 }));
    assert.strictEqual(mix.ice.serviceBags, 3); // 150 x 60 g x 1.15 = 10.35 kg -> 3 bolsas de 5 kg
});

test('canchero: sugerencia de bolsas de conservadora por litros de bebida fria', () => {
    const r = api.calculateCanchero(cstate([item('beer', null, 100)], { iceBagKg: 5 }));
    assert.strictEqual(r.ice.suggestedCoolerBags, 15); // 300 x 473 ml = 141.9 L x 0.5 kg = 70.95 kg -> 15 bolsas
});

test('canchero: citricos agrupados por fruta', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 50), item('cocktail', 'negroni', 50)], { fruitPriceKg: 1000 }));
    const by = Object.fromEntries(r.citrus.map(c => [c.fruitType, c]));
    assert.strictEqual(by.Limas.totalSlices, 300);
    assert.strictEqual(by.Limas.fruitsNeeded, 38);
    assert.ok(Math.abs(by.Limas.kgNeeded - 3.04) < 1e-9);
    assert.strictEqual(by.Naranjas.fruitsNeeded, 38);
    assert.ok(Math.abs(by.Naranjas.kgNeeded - 9.5) < 1e-9);
});

test('canchero: costo por porcion del item', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 100)]));
    assert.ok(Math.abs(r.items[0].costPerServing - (45 / 750 * 12000 + 250 / 1500 * 2500)) < 1e-6);
});

test('canchero: el costo de insumos suma compras, hielo, citricos, vasos y extras', () => {
    const r = api.calculateCanchero(cstate(api.defaultMenu()));
    const sum = r.purchases.reduce((a, p) => a + p.subtotal, 0) + r.ice.cost
        + r.citrus.reduce((a, c) => a + c.cost, 0) + r.vessels.cost + (r.extras ? r.extras.cost : 0);
    assert.ok(Math.abs(r.budget.supplyCost - sum) < 1e-6);
    assert.ok(Math.abs(r.budget.totalCost - (sum + r.budget.otherCosts + r.budget.staffCost)) < 1e-6);
});

test('canchero: la carta por defecto es finita y no repite compras', () => {
    const menu = api.defaultMenu();
    assert.deepStrictEqual(menu.map(i => i.sharePct), [40, 30, 20, 10]);
    const r = api.calculateCanchero(cstate(menu));
    assert.ok(Number.isFinite(r.budget.totalCost));
    const keys = r.purchases.map(p => p.name.trim().toLowerCase() + '|' + p.bottleMl);
    assert.strictEqual(new Set(keys).size, keys.length);
});

test('sanitizeMenuItem: basura devuelve null y recorta porcentaje y largo de la carta', () => {
    assert.strictEqual(api.sanitizeMenuItem(5), null);
    assert.strictEqual(api.sanitizeMenuItem(null), null);
    assert.strictEqual(api.sanitizeMenuItem({ kind: 'cocktail', sharePct: 500 }).sharePct, 100);
    const many = Array.from({ length: 25 }, () => api.makeMenuItem('beer'));
    assert.strictEqual(api.sanitizeState({ menu: many }).menu.length, 20);
    assert.deepStrictEqual(plain(api.sanitizeState({ menu: [5, null, 'x'] }).menu), []);
});

test('makeMenuItem: valores iniciales de cerveza, vino y sin alcohol', () => {
    const b = api.makeMenuItem('beer');
    assert.deepStrictEqual([b.glassId, b.iceGrams, b.ingredients[0].pourMl, b.ingredients[0].bottleMl, b.ingredients[0].price, b.ingredients[0].abv], ['none', 0, 473, 473, 1500, 5]);
    const w = api.makeMenuItem('wine');
    assert.deepStrictEqual([w.glassId, w.iceGrams, w.ingredients[0].pourMl, w.ingredients[0].bottleMl, w.ingredients[0].price, w.ingredients[0].abv], ['balloon', 0, 150, 750, 6000, 12.5]);
    const s = api.makeMenuItem('soft');
    assert.deepStrictEqual([s.glassId, s.iceGrams, s.ingredients[0].pourMl, s.ingredients[0].bottleMl, s.ingredients[0].price, s.ingredients[0].abv], ['highball', 60, 300, 1500, 2500, 0]);
});

test('canchero: cada item expone la porcion final de sus ingredientes (auto-completar incluido)', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 60), item('beer', null, 40)]));
    assert.deepStrictEqual(plain(r.items[0].pours), [45, 250]);
    assert.deepStrictEqual(plain(r.items[1].pours), [473]);
});

test('canchero: sin vaso, un ingrediente con auto-completar usa su porcion fija', () => {
    const it = item('cocktail', 'gin-tonic', 100, { glassId: 'none' });
    const r = api.calculateCanchero(cstate([it]));
    assert.deepStrictEqual(plain(r.items[0].pours), [45, 250]);
});

// ---------------- El Canchero: Task 6 (regresion de datos y plantillas) ----------------

test('plantilla aplicada a un evento canchero conserva la carta', () => {
    const s = api.applyTemplate(cstate(api.defaultMenu()), 'boda');
    assert.strictEqual(s.guests, 100);
    assert.strictEqual(s.menu.length, 4);
    assert.deepStrictEqual(s.menu.map(i => i.sharePct), [40, 30, 20, 10]);
});

test('evento canchero sobrevive al sanear el almacen (nivel y carta)', () => {
    const ev = api.makeEvent('C', cstate(api.defaultMenu()), 'canchero');
    const st = api.sanitizeStore({ events: [ev], activeId: ev.id });
    assert.strictEqual(st.events[0].level, 'canchero');
    assert.strictEqual(st.events[0].state.menu.length, 4);
    const r = api.calculateCanchero(st.events[0].state);
    assert.ok(Number.isFinite(r.budget.totalCost));
});

test('respaldo con un evento canchero y un menu corrupto se importa sin romper', () => {
    const good = api.makeEvent('Bueno', cstate(api.defaultMenu()), 'canchero');
    const bad = { id: 'x9', name: 'Malo', level: 'canchero', state: { menu: [{ kind: 'wine', sharePct: 'abc', ingredients: 7 }, 5, null] } };
    const res = api.mergeImportedEvents(api.sanitizeStore(null), { events: [good, bad] });
    assert.strictEqual(res.added, 2);
    const evBad = res.store.events[2];
    assert.strictEqual(evBad.level, 'canchero');
    assert.strictEqual(evBad.state.menu.length, 1);
    assert.ok(Number.isFinite(api.calculateCanchero(evBad.state).budget.totalCost));
});

test('ids de la carta se mantienen unicos al sanear', () => {
    const a = api.makeMenuItem('beer');
    const s = api.sanitizeState({ menu: [a, { ...a }, { ...a }] });
    assert.strictEqual(new Set(s.menu.map(i => i.id)).size, 3);
});

// ---------------- Revision final: hallazgos 1 a 4 ----------------

test('JSON hostil: claves heredadas (toString, constructor, __proto__) no dejan NaN en el Canchero', () => {
    for (const bad of ['toString', 'constructor', '__proto__']) {
        const it = api.sanitizeMenuItem({ kind: bad, fruitType: bad, glassId: bad, slicesPerDrink: 2, sharePct: 100 });
        assert.strictEqual(it.kind, 'cocktail', bad);
        assert.strictEqual(it.fruitType, 'Sin guarnición', bad);
        assert.notStrictEqual(it.glassId, bad, bad);
        const r = api.calculateCanchero(cstate([it]));
        assert.ok(Number.isFinite(r.budget.totalCost), bad);
        assert.ok(Number.isFinite(r.budget.finalClientPrice), bad);
        assert.strictEqual(api.makeMenuItem(bad, bad).kind, 'cocktail', bad);
    }
});

test('JSON hostil: claves heredadas en el estado general caen a los valores por defecto', () => {
    const d = api.getDefaultState();
    for (const bad of ['toString', 'constructor', '__proto__']) {
        const s = api.sanitizeState({ iceLevel: bad, fruitType: bad, profile: bad, activeRecipe: bad, glassId: bad });
        assert.strictEqual(s.iceLevel, d.iceLevel, bad);
        assert.strictEqual(s.fruitType, d.fruitType, bad);
        assert.strictEqual(s.profile, d.profile, bad);
        assert.strictEqual(s.activeRecipe, d.activeRecipe, bad);
        assert.strictEqual(s.glassId, d.glassId, bad);
    }
});

test('canchero: un item sin vaso no suma hielo de servicio aunque traiga gramos', () => {
    const it = item('cocktail', 'gin-tonic', 100, { glassId: 'none', iceGrams: 95 });
    const r = api.calculateCanchero(cstate([it]));
    assert.strictEqual(r.ice.serviceBags, 0);
});

test('canchero: si un ingrediente unido tiene precios distintos se usa el mas alto y se avisa', () => {
    const gt = item('cocktail', 'gin-tonic', 50);
    const ng = item('cocktail', 'negroni', 50);
    ng.ingredients[0] = { ...ng.ingredients[0], price: 99999 };
    const r = api.calculateCanchero(cstate([gt, ng]));
    const gin = rowByName(r, 'gin (botella)')[0];
    assert.strictEqual(gin.priceConflict, true);
    assert.strictEqual(gin.price, 99999);
    assert.strictEqual(gin.subtotal, 15 * 99999);
    const same = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 50), item('cocktail', 'negroni', 50)]));
    assert.strictEqual(rowByName(same, 'gin (botella)')[0].priceConflict, false);
});

test('canchero: carta vacia o sin porcentajes no cobra servilletas ni sorbetes', () => {
    const r = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 0)]));
    assert.strictEqual(r.extras, null);
    assert.strictEqual(r.budget.costPerDrink, 0);
    assert.ok(Math.abs(r.budget.supplyCost - (r.ice.cost + r.vessels.cost)) < 1e-6);
    const withShare = api.calculateCanchero(cstate([item('cocktail', 'gin-tonic', 100)]));
    assert.ok(withShare.extras !== null);
});

// ---------------- Catalogo de inspiracion y menu para la barra ----------------

const CAT = () => api.CATALOG;
const byName = (n) => api.CATALOG.find(e => e.name === n);
const mlOf = (e, re) => { const i = e.ingredients.find(x => re.test(x.n)); return i ? i.ml : undefined; };

test('catalogo: tiene unas 96 recetas con ids y nombres unicos', () => {
    assert.ok(CAT().length >= 90, 'recetas: ' + CAT().length);
    assert.strictEqual(new Set(CAT().map(e => e.id)).size, CAT().length);
    assert.strictEqual(new Set(CAT().map(e => e.name)).size, CAT().length);
});

test('catalogo: cada receta es valida (dificultad, estado, prioridad, ingredientes, medidas)', () => {
    for (const e of CAT()) {
        assert.ok(['F', 'M', 'D'].includes(e.diff), e.name + ' dificultad');
        assert.ok(['O', 'M', 'P', 'E'].includes(e.status), e.name + ' estado');
        assert.ok([1, 2, 3].includes(e.prio), e.name + ' prioridad');
        assert.ok(e.base && e.style && e.glass && e.method && e.garnish, e.name + ' campos de texto');
        assert.ok(e.ingredients.length >= 1, e.name + ' ingredientes');
        for (const i of e.ingredients) {
            assert.ok(i.n && i.n.length > 0, e.name + ' nombre de ingrediente');
            assert.ok(Number.isFinite(i.ml) && i.ml >= 0 && i.ml <= 400, e.name + ' ml ' + i.n + ' ' + i.ml);
        }
    }
});

test('catalogo: los clasicos tienen las medidas de la ficha oficial', () => {
    const neg = byName('Negroni');
    assert.deepStrictEqual([mlOf(neg, /gin/i), mlOf(neg, /campari/i), mlOf(neg, /vermut/i)], [30, 30, 30]);
    const mar = byName('Margarita');
    assert.deepStrictEqual([mlOf(mar, /tequila/i), mlOf(mar, /triple/i), mlOf(mar, /lima/i)], [50, 20, 15]);
    const cuba = byName('Cuba Libre');
    assert.deepStrictEqual([mlOf(cuba, /ron/i), mlOf(cuba, /cola/i), mlOf(cuba, /lima/i)], [50, 120, 10]);
    const spritz = byName('Spritz (Aperol)');
    assert.deepStrictEqual([mlOf(spritz, /espumante/i), mlOf(spritz, /aperol/i)], [90, 60]);
    assert.strictEqual(byName('Negroni').status, 'O');
});

test('catalogo: las proporciones populares y estimadas estan marcadas como tales', () => {
    assert.strictEqual(byName('Fernet con Coca').status, 'P');
    assert.strictEqual(byName('Gancia batido').status, 'E');
    assert.strictEqual(byName('White Russian').status, 'E');
    assert.ok(api.CATALOG_STATUS.O && api.CATALOG_STATUS.P && api.CATALOG_STATUS.E && api.CATALOG_STATUS.M);
});

test('catalogo: filtros por texto, base, dificultad y prioridad', () => {
    const f = api.filterCatalog;
    assert.ok(f(CAT(), { q: 'campari' }).some(e => e.name === 'Negroni'));
    assert.ok(f(CAT(), { q: 'CAMPARÍ' }).some(e => e.name === 'Negroni'), 'sin tildes ni mayusculas');
    assert.ok(f(CAT(), { base: 'Gin' }).every(e => e.base === 'Gin'));
    assert.ok(f(CAT(), { diff: 'D' }).every(e => e.diff === 'D') && f(CAT(), { diff: 'D' }).length > 0);
    assert.ok(f(CAT(), { prio1: true }).every(e => e.prio === 1));
    assert.strictEqual(f(CAT(), {}).length, CAT().length);
    assert.strictEqual(f(CAT(), { q: 'zzzxxx' }).length, 0);
});

test('catalogo: bottleKey distingue botellas de jugos y mixers y no confunde ginger con gin', () => {
    assert.strictEqual(api.bottleKey('Gin'), 'gin');
    assert.strictEqual(api.bottleKey('Ginger ale'), null);
    assert.strictEqual(api.bottleKey('Ginger beer'), null);
    assert.strictEqual(api.bottleKey('Jugo de limón'), null);
    assert.strictEqual(api.bottleKey('Soda'), null);
    assert.strictEqual(api.bottleKey('Ron blanco'), 'ron');
    assert.strictEqual(api.bottleKey('Ron añejo'), 'ron');
    assert.strictEqual(api.bottleKey('Vermut rosso'), 'vermut rosso');
    assert.strictEqual(api.bottleKey('Cinzano Rosso'), 'vermut rosso');
    assert.strictEqual(api.bottleKey('Campari'), 'campari');
});

test('catalogo: "mi bar" deja solo lo que se puede preparar con esas botellas', () => {
    const owned = new Set(['gin', 'campari', 'vermut rosso']);
    assert.strictEqual(api.canMake(byName('Negroni'), owned), true);
    assert.strictEqual(api.canMake(byName('Margarita'), owned), false);
    const list = api.filterCatalog(CAT(), { onlyOwned: true, owned });
    assert.ok(list.some(e => e.name === 'Negroni'));
    assert.ok(list.every(e => api.canMake(e, owned)));
    assert.strictEqual(api.filterCatalog(CAT(), { onlyOwned: true, owned: new Set() }).every(e => api.canMake(e, new Set())), true);
});

test('catalogo: detecta insumos dificiles y propone un reemplazo', () => {
    const lw = api.hardIngredients(byName('Last Word'));
    assert.ok(lw.length >= 1);
    assert.ok(lw.every(h => h.name && h.sub));
    assert.deepStrictEqual(plain(api.hardIngredients(byName('Negroni'))), []);
    assert.ok(api.hardIngredients(byName('Moscow Mule')).some(h => /ginger beer/i.test(h.name)));
});

test('catalogo: toda receta pasa a la carta del Canchero como item valido y calculable', () => {
    for (const e of CAT()) {
        const it = api.catalogToMenuItem(e);
        assert.strictEqual(it.kind, 'cocktail', e.name);
        assert.strictEqual(it.name, e.name, e.name);
        assert.ok(it.glassId !== 'none', e.name);
        assert.deepStrictEqual(plain(api.sanitizeMenuItem(it)).name, it.name, e.name);
        const r = api.calculateCanchero(cstate([{ ...it, sharePct: 100 }]));
        assert.ok(Number.isFinite(r.budget.totalCost), e.name);
        assert.ok(r.items[0].pours.every(Number.isFinite), e.name);
    }
});

test('catalogo: la carta respeta ml, hielo segun el vaso y no cobra ingredientes sin medida', () => {
    const neg = api.catalogToMenuItem(byName('Negroni'));
    assert.deepStrictEqual(neg.ingredients.map(i => i.pourMl), [30, 30, 30]);
    assert.ok(neg.iceGrams > 0);
    const dry = api.catalogToMenuItem(byName('Dry Martini'));
    assert.strictEqual(dry.iceGrams, 0);
    const mojito = api.catalogToMenuItem(byName('Mojito'));
    const menta = mojito.ingredients.find(i => /menta/i.test(i.name));
    assert.strictEqual(menta.pourMl, 0);
    assert.strictEqual(menta.price, 0);
    const soda = mojito.ingredients.find(i => /soda/i.test(i.name));
    assert.strictEqual(soda.autoFill, true);
});

test('catalogo: "usar en Principiante" carga receta, vaso, hielo y nombre', () => {
    const s = api.catalogToPrincipiante(api.getDefaultState(), byName('Negroni'));
    assert.strictEqual(s.recipeName, 'Negroni');
    assert.strictEqual(s.activeRecipe, '');
    assert.deepStrictEqual(s.ingredients.map(i => i.pourMl), [30, 30, 30]);
    assert.strictEqual(s.glassId, 'rocks');
    const r = api.calculate(s);
    assert.ok(Number.isFinite(r.budget.totalCost));
    for (const e of CAT()) {
        const st = api.catalogToPrincipiante(api.getDefaultState(), e);
        if (st) assert.ok(Number.isFinite(api.calculate(st).budget.totalCost), e.name);
    }
});

test('catalogo: sin ingredientes medibles no se puede usar en Principiante (devuelve null)', () => {
    assert.strictEqual(api.catalogToPrincipiante(api.getDefaultState(), byName('Clericó (jarra)')), null);
});

test('estado: recipeName se sanea y activeRecipe vacio es valido', () => {
    const s = api.sanitizeState({ recipeName: 'x'.repeat(200), activeRecipe: '' });
    assert.strictEqual(s.recipeName.length, 60);
    assert.strictEqual(s.activeRecipe, '');
    assert.strictEqual(api.sanitizeState({ recipeName: 5 }).recipeName, '');
    assert.strictEqual(api.sanitizeState({ activeRecipe: 'toString' }).activeRecipe, api.getDefaultState().activeRecipe);
});

test('menu: el modelo del PDF solo trae nombres, sin precios ni cantidades', () => {
    const ev = api.makeEvent('Fiesta de Ana', cstate(api.defaultMenu()), 'canchero');
    ev.client = 'Ana'; ev.date = '2026-12-05';
    const m = api.buildMenuModel(ev);
    assert.strictEqual(m.title, 'Fiesta de Ana');
    assert.strictEqual(m.items.length, 4);
    const text = JSON.stringify(m);
    assert.ok(!/\$|precio|costo/i.test(text), 'sin precios');
    assert.ok(!/\d+\s*ml/i.test(text), 'sin cantidades');
    const gin = m.items.find(i => i.name === 'Gin Tonic');
    assert.deepStrictEqual(plain(gin.ingredients), ['Gin', 'Agua Tónica']);
    assert.ok(!/botella/i.test(text), 'sin "(Botella)"');
});

test('menu: omite lo que tiene 0% en la carta y los items simples no repiten ingredientes', () => {
    const menu = [item('cocktail', 'gin-tonic', 50), item('cocktail', 'negroni', 0), item('beer', null, 50)];
    const m = api.buildMenuModel(api.makeEvent('E', cstate(menu), 'canchero'));
    assert.deepStrictEqual(m.items.map(i => i.name), ['Gin Tonic', 'Cerveza (lata)']);
    assert.deepStrictEqual(plain(m.items[1].ingredients), []);
});

test('menu: Principiante usa el nombre de la receta, y el de catalogo si lo hay', () => {
    const ev = api.makeEvent('E', api.getDefaultState(), 'principiante');
    assert.deepStrictEqual(plain(api.buildMenuModel(ev).items.map(i => i.name)), ['Gin Tonic']);
    ev.state = api.catalogToPrincipiante(ev.state, byName('Negroni'));
    const m = api.buildMenuModel(ev);
    assert.strictEqual(m.items[0].name, 'Negroni');
    assert.deepStrictEqual(plain(m.items[0].ingredients), ['Gin', 'Campari', 'Vermut rosso']);
});

test('menu: ingredientes sin medida quedan como nombre limpio (sin cantidad ni unidad)', () => {
    const m = api.buildMenuModel(api.makeEvent('E', cstate([{ ...api.catalogToMenuItem(byName('Mojito')), sharePct: 100 }]), 'canchero'));
    const names = m.items[0].ingredients;
    assert.ok(names.includes('menta'), names.join(','));
    assert.ok(!names.some(n => /^\d/.test(n)), names.join(','));
});

test('menu: carta vacia da un menu sin items y no rompe', () => {
    const m = api.buildMenuModel(api.makeEvent('Vacio', cstate([]), 'canchero'));
    assert.deepStrictEqual(plain(m.items), []);
});

// ---------------- Revision del catalogo: hallazgos 1 a 5 ----------------

test('revision: el chorrito de soda es una medida fija chica y no completa el vaso', () => {
    for (const n of ['Gin Fizz', 'Spritz (Aperol)', 'Spritz con Cynar', 'Americano']) {
        const soda = byName(n).ingredients.find(i => /soda/i.test(i.n));
        assert.strictEqual(soda.fill, undefined, n + ' sigue como completar');
        assert.strictEqual(soda.ml, 30, n);
    }
    const r = api.calculateCanchero(cstate([{ ...api.catalogToMenuItem(byName('Spritz (Aperol)')), sharePct: 100 }]));
    assert.deepStrictEqual(plain(r.items[0].pours), [90, 60, 30]);
});

test('revision: ningun ingrediente "completar" del catalogo pasa de 250 ml', () => {
    for (const e of CAT()) {
        const it = api.catalogToMenuItem(e);
        const r = api.calculateCanchero(cstate([{ ...it, sharePct: 100 }]));
        it.ingredients.forEach((ing, i) => { if (ing.autoFill) assert.ok(r.items[0].pours[i] <= 250, e.name + ' ' + r.items[0].pours[i]); });
    }
});

test('revision: la Paloma usa los 5 ml de lima de la ficha oficial', () => {
    const p = byName('Paloma');
    assert.strictEqual(p.status, 'O');
    assert.strictEqual(mlOf(p, /lima/i), 5);
});

test('revision: el menu limpia "dash" en singular y "pizca"', () => {
    const it = { ...api.makeMenuItem('cocktail', 'gin-tonic'), sharePct: 100, ingredients: [
        { id: 'a', name: '1 dash de Angostura', pourMl: 0, autoFill: false, bottleMl: 100, price: 0, abv: 0 },
        { id: 'b', name: 'pizca de sal', pourMl: 0, autoFill: false, bottleMl: 100, price: 0, abv: 0 },
        { id: 'c', name: '2 dashes de bitter', pourMl: 0, autoFill: false, bottleMl: 100, price: 0, abv: 0 }
    ] };
    const m = api.buildMenuModel(api.makeEvent('E', cstate([it]), 'canchero'));
    assert.deepStrictEqual(plain(m.items[0].ingredients), ['Angostura', 'sal', 'bitter']);
});

test('revision: el modelo del menu cuenta los items que quedan afuera por tener 0%', () => {
    const menu = [item('cocktail', 'gin-tonic', 100), item('cocktail', 'negroni', 0), item('beer', null, 0)];
    const m = api.buildMenuModel(api.makeEvent('E', cstate(menu), 'canchero'));
    assert.strictEqual(m.items.length, 1);
    assert.strictEqual(m.hiddenCount, 2);
    assert.strictEqual(api.buildMenuModel(api.makeEvent('P', api.getDefaultState(), 'principiante')).hiddenCount, 0);
});

// ---------------- Ajustes de uso: horarios, personal y opciones "Otros" ----------------

test('horarios: llegada 19:00 y fin 03:00 dan armado, atencion y limpieza de 1 h cada una', () => {
    const h = api.scheduleInfo(base({ arrival: '19:00', endTime: '03:00' }));
    assert.deepStrictEqual(plain(h), {
        arrival: '19:00', serviceStart: '20:00', serviceEnd: '02:00', end: '03:00',
        totalH: 8, setupH: 1, teardownH: 1, serviceH: 6, valid: true
    });
});

test('horarios: sin horas no hay cronograma y el formato invalido se descarta', () => {
    assert.strictEqual(api.scheduleInfo(base()), null);
    assert.strictEqual(api.scheduleInfo(base({ arrival: '19:00' })), null);
    const s = api.sanitizeState({ arrival: '25:99', endTime: 'abc' });
    assert.strictEqual(s.arrival, '');
    assert.strictEqual(s.endTime, '');
    assert.strictEqual(api.sanitizeState({ arrival: '9:00' }).arrival, '');
    assert.strictEqual(api.sanitizeState({ arrival: '09:05' }).arrival, '09:05');
});

test('horarios: cruza la medianoche y respeta un armado y retiro distintos', () => {
    const h = api.scheduleInfo(base({ arrival: '22:30', endTime: '02:30', setupHours: 0.5, teardownHours: 0.5 }));
    assert.deepStrictEqual([h.totalH, h.serviceH, h.serviceStart, h.serviceEnd], [4, 3, '23:00', '02:00']);
});

test('horarios: un evento demasiado corto o con la misma hora de llegada y fin no es valido', () => {
    const corto = api.scheduleInfo(base({ arrival: '19:00', endTime: '21:00' }));
    assert.strictEqual(corto.serviceH, 0);
    assert.strictEqual(corto.valid, false);
    assert.strictEqual(api.scheduleInfo(base({ arrival: '19:00', endTime: '19:00' })).valid, false);
});

test('personal: con horarios se paga armado, atencion y retiro (todas las horas)', () => {
    const conHorarios = api.calculate(base({ guests: 100, staffList: team(3, 5000), arrival: '19:00', endTime: '03:00' })).budget;
    assert.strictEqual(conHorarios.staffCost, 3 * 8 * 5000);
    const sinHorarios = api.calculate(base({ guests: 100, staffList: team(3, 5000), eventHours: 4 })).budget;
    assert.strictEqual(sinHorarios.staffCost, 3 * 4 * 5000);
});

test('personal: cada persona cobra su propio pago y el costo es la suma', () => {
    const lista = [{ name: 'Ana', rate: 6000 }, { name: 'Beto', rate: 4000 }, { name: '', rate: 1000 }];
    const b = api.calculate(base({ guests: 100, eventHours: 4, staffList: lista })).budget;
    assert.strictEqual(b.staffPeople, 3);
    assert.strictEqual(b.staffCost, 4 * (6000 + 4000 + 1000));
    assert.deepStrictEqual(plain(b.staffDetail), [
        { name: 'Ana', rate: 6000, cost: 24000 },
        { name: 'Beto', rate: 4000, cost: 16000 },
        { name: '', rate: 1000, cost: 4000 }
    ]);
});

test('personal: sin lista cargada no se suma costo y la cantidad sugerida queda de referencia', () => {
    const b = api.calculate(base({ guests: 100, eventHours: 4 })).budget;
    assert.strictEqual(b.staffCost, 0);
    assert.strictEqual(b.staffPeople, 3);
    assert.strictEqual(b.staffDetail.length, 0);
});

test('presupuesto: ganancia por hora de atencion y por hora total', () => {
    const b = api.calculate(base({ arrival: '19:00', endTime: '03:00' })).budget;
    assert.ok(Math.abs(b.profitPerServiceHour - b.netProfit / 6) < 1e-6);
    assert.ok(Math.abs(b.profitPerTotalHour - b.netProfit / 8) < 1e-6);
    assert.strictEqual(b.serviceHours, 6);
    const sin = api.calculate(base({ eventHours: 4 })).budget;
    assert.ok(Math.abs(sin.profitPerServiceHour - sin.netProfit / 4) < 1e-6);
    assert.strictEqual(sin.schedule, null);
});

test('estado: el personal manual y los horarios del evento se sanean', () => {
    const s = api.sanitizeState({ staffList: Array.from({ length: 80 }, () => ({ name: 'x'.repeat(99), rate: -5 })), setupHours: -3, teardownHours: 99, arrival: '19:00', endTime: '03:00' });
    assert.strictEqual(s.staffList.length, 50);
    assert.strictEqual(s.staffList[0].name.length, 40);
    assert.strictEqual(s.staffList[0].rate, 0);
    assert.strictEqual(s.setupHours, 0);
    assert.strictEqual(s.teardownHours, 6);
    assert.deepStrictEqual(plain(api.sanitizeState({ staffList: [null, 'x', { name: 7, rate: 'y' }] }).staffList), [{ name: '', rate: 0 }]);
    assert.deepStrictEqual(plain(api.sanitizeState({}).staffList), []);
});

test('personal: las sesiones viejas (staffCount + staffRate) pasan a una fila por persona', () => {
    const conCantidad = api.sanitizeState({ staffCount: 2, staffRate: 3000 });
    assert.deepStrictEqual(plain(conCantidad.staffList), [{ name: '', rate: 3000 }, { name: '', rate: 3000 }]);
    // cantidad en 0 = usaba la sugerida: 100 invitados -> 2 bartenders + 1 ayudante
    const sugerida = api.sanitizeState({ guests: 100, staffRate: 2500 });
    assert.deepStrictEqual(plain(sugerida.staffList), team(3, 2500));
    // sin pago ni cantidad no había personal
    assert.deepStrictEqual(plain(api.sanitizeState({ staffCount: 0, staffRate: 0 }).staffList), []);
    // una lista nueva manda sobre los campos viejos
    assert.deepStrictEqual(plain(api.sanitizeState({ staffList: [], staffCount: 4, staffRate: 1000 }).staffList), []);
});

test('citricos "Otros": se compran envases segun los usos por trago', () => {
    const r = api.calculate(base({ guests: 40, drinksPerGuest: 3, fruitType: 'Otros', fruitName: 'Angostura', otherUsesPerDrink: 2, otherUsesPerPack: 100, otherPackPrice: 6000 }));
    assert.strictEqual(r.citrus.fruitType, 'Angostura');
    assert.strictEqual(r.citrus.totalUses, 240);
    assert.strictEqual(r.citrus.packs, 3);
    assert.strictEqual(r.citrus.cost, 18000);
    const sinNombre = api.calculate(base({ fruitType: 'Otros', fruitName: '  ' }));
    assert.strictEqual(sinNombre.citrus.fruitType, 'Otros');
    assert.strictEqual(api.sanitizeState({ fruitType: 'Otros', fruitName: 'x'.repeat(90) }).fruitName.length, 40);
});

test('bebida "Otros": se guarda con nombre y se vuelve a cargar en otro evento', () => {
    const s = base({
        glassId: 'rocks', glassCapacity: 250, iceLevel: 'manual', iceGrams: 30,
        ingredients: [{ name: 'Mi licor', pourMl: 60, autoFill: false, bottleMl: 700, price: 8000, abv: 25 }]
    });
    const rec = api.makeCustomRecipe('Mi trago', s);
    assert.strictEqual(rec.name, 'Mi trago');
    assert.ok(rec.id);
    const otro = api.applyCustomRecipe(api.getDefaultState(), rec);
    assert.strictEqual(otro.recipeName, 'Mi trago');
    assert.strictEqual(otro.activeRecipe, '');
    assert.strictEqual(otro.glassId, 'rocks');
    assert.strictEqual(otro.iceGrams, 30);
    assert.deepStrictEqual(plain(otro.ingredients.map(i => [i.name, i.pourMl, i.price])), [['Mi licor', 60, 8000]]);
    assert.ok(Number.isFinite(api.calculate(otro).budget.totalCost));
});

test('bebida y citrico "Otros": lo guardado que viene roto se descarta o se sanea', () => {
    assert.strictEqual(api.sanitizeCustomRecipe(null), null);
    assert.strictEqual(api.sanitizeCustomRecipe(5), null);
    assert.strictEqual(api.sanitizeCustomRecipe({ name: '   ' }), null);
    assert.strictEqual(api.sanitizeCustomRecipe({ name: 'x'.repeat(200), config: {} }).name.length, 60);
    assert.strictEqual(api.sanitizeCustomGarnish(null), null);
    assert.strictEqual(api.sanitizeCustomGarnish({ name: '' }), null);
    const g = api.sanitizeCustomGarnish({ name: 'Angostura', usesPerDrink: 'x', usesPerPack: -4, packPrice: 'abc' });
    assert.strictEqual(g.name, 'Angostura');
    assert.ok(g.usesPerDrink >= 0 && g.usesPerPack >= 1 && g.packPrice >= 0);
    assert.strictEqual(api.sanitizeCustomList([null, 5, { name: 'ok', config: {} }, { name: '' }], api.sanitizeCustomRecipe).length, 1);
    assert.strictEqual(api.sanitizeCustomList(Array.from({ length: 40 }, (_, i) => ({ name: 'r' + i, config: {} })), api.sanitizeCustomRecipe).length, 20);
});

// ---------------- Revision de los ajustes de uso ----------------

test('revision: un cronograma invalido no entra al presupuesto ni al texto del cliente', () => {
    const b = api.calculate(base({ guests: 100, staffList: team(3, 5000), eventHours: 4, arrival: '19:00', endTime: '20:00' })).budget;
    assert.strictEqual(b.schedule, null);
    assert.strictEqual(b.staffCost, 3 * 4 * 5000);
    assert.strictEqual(b.serviceHours, 4);
});

test('revision: llegada igual a fin no se toma como un evento de 24 horas', () => {
    const b = api.calculate(base({ guests: 100, staffList: team(3, 5000), eventHours: 4, arrival: '20:00', endTime: '20:00' })).budget;
    assert.strictEqual(b.schedule, null);
    assert.strictEqual(b.staffCost, 3 * 4 * 5000);
});

test('revision: Principiante siempre usa los valores de la consigna, aunque el evento traiga otro perfil', () => {
    const state = { profile: 'real', iceMlPerGram: 1, headspaceMl: 15, bottleBufferPct: 8 };
    const st = api.sanitizeStore({ events: [{ id: 'p1', level: 'principiante', state }, { id: 'c1', level: 'canchero', state }] });
    assert.deepStrictEqual(
        plain([st.events[0].state.profile, st.events[0].state.iceMlPerGram, st.events[0].state.headspaceMl, st.events[0].state.bottleBufferPct]),
        ['consigna', 0.85, 0, 0]);
    assert.deepStrictEqual(plain([st.events[1].state.profile, st.events[1].state.bottleBufferPct]), ['real', 8]);
});

test('revision: la bebida Otros guardada conserva el bitter (usos, rinde y precio)', () => {
    const s = base({ fruitType: 'Otros', fruitName: 'Bitter X', otherUsesPerDrink: 7, otherUsesPerPack: 250, otherPackPrice: 9100 });
    const otro = api.applyCustomRecipe(api.getDefaultState(), api.makeCustomRecipe('Mi trago', s));
    assert.deepStrictEqual(plain([otro.fruitType, otro.fruitName, otro.otherUsesPerDrink, otro.otherUsesPerPack, otro.otherPackPrice]),
        ['Otros', 'Bitter X', 7, 250, 9100]);
});

// ---------------- Pulido de pendientes menores ----------------

test('pulido: una plantilla con horarios cargados usa las horas del cronograma', () => {
    const t = api.applyTemplate(base({ arrival: '19:00', endTime: '03:00' }), 'corporativo');
    assert.strictEqual(t.eventHours, 6);
    assert.strictEqual(t.drinksPerGuest, api.suggestDrinksPerGuest(6, 0.8));
    const sin = api.applyTemplate(base(), 'corporativo');
    assert.strictEqual(sin.eventHours, 3);
});

test('pulido: las horas de atencion no redondeadas se usan exactas', () => {
    const b = api.calculate(base({ arrival: '19:10', endTime: '23:55' })).budget;
    assert.strictEqual(b.serviceHours, 2.75);
    assert.ok(Math.abs(b.profitPerServiceHour - b.netProfit / 2.75) < 1e-6);
});

test('pulido: una cantidad vieja con decimales no da cero personas al migrar', () => {
    assert.strictEqual(api.sanitizeState({ staffRate: 1000, staffCount: 0.4 }).staffList.length, 1);
    assert.strictEqual(api.sanitizeState({ staffRate: 1000, staffCount: 2.6 }).staffList.length, 3);
});

test('pulido: el Canchero compra bitter u otra guarnicion propia por envases', () => {
    const gt = (share, over = {}) => ({ ...item('cocktail', 'gin-tonic', share), fruitType: 'Otros', fruitName: 'Angostura', slicesPerDrink: 2, otherUsesPerPack: 100, otherPackPrice: 6000, ...over });
    const r = api.calculateCanchero(cstate([gt(100)]));
    const o = r.citrus.find(c => c.other);
    assert.deepStrictEqual(plain([o.fruitType, o.totalUses, o.packs, o.cost]), ['Angostura', 600, 6, 36000]);
    const dos = api.calculateCanchero(cstate([gt(50), { ...gt(50), name: 'Otro trago' }]));
    assert.strictEqual(dos.citrus.filter(c => c.other).length, 1);
    assert.strictEqual(dos.citrus.find(c => c.other).packs, 6);
    const it = api.sanitizeMenuItem({ kind: 'cocktail', fruitType: 'Otros', fruitName: { toString: 1 }, otherUsesPerPack: 'x', otherPackPrice: -5 });
    assert.strictEqual(it.fruitType, 'Otros');
    assert.strictEqual(it.fruitName, '');
    assert.ok(it.otherUsesPerPack >= 1 && it.otherPackPrice >= 0);
    assert.strictEqual(api.sanitizeMenuItem({ kind: 'cocktail', fruitType: 'toString' }).fruitType, 'Sin guarnición');
});

test('pulido: lo guardado en "Otros" aguanta datos rotos, repetidos y listas enormes', () => {
    assert.strictEqual(api.sanitizeCustomRecipe({ name: { toString: 1 }, config: {} }), null);
    assert.strictEqual(api.sanitizeCustomGarnish({ name: { toString: 1 } }), null);
    const list = api.sanitizeCustomList([{ name: { toString: 1 } }, { name: 'Dup', config: {} }, { name: 'dup', config: {} }, { name: 'Otra', config: {} }], api.sanitizeCustomRecipe);
    assert.deepStrictEqual(plain(list.map(r => r.name)), ['Dup', 'Otra']);
    let llamadas = 0;
    api.sanitizeCustomList(Array.from({ length: 5000 }, (_, i) => ({ name: 'n' + i, config: {} })), x => { llamadas++; return api.sanitizeCustomRecipe(x); });
    assert.ok(llamadas <= 200, 'llamadas ' + llamadas);
});

test('pulido: los ajustes avanzados se recuerdan por evento', () => {
    assert.strictEqual(api.getDefaultState().advancedOn, false);
    assert.strictEqual(api.sanitizeState({ advancedOn: true }).advancedOn, true);
    assert.strictEqual(api.sanitizeState({ advancedOn: 'si' }).advancedOn, false);
});

test('pulido: el menu limpia cantidades escritas a mano en el nombre del ingrediente', () => {
    const f = api.menuIngredientName;
    assert.strictEqual(f('Gin 50ml'), 'Gin');
    assert.strictEqual(f('Jugo de limón 30 ml'), 'Jugo de limón');
    assert.strictEqual(f('2 oz Bourbon'), 'Bourbon');
    assert.strictEqual(f('0.5 L soda'), 'soda');
    assert.strictEqual(f('1/2 limón'), 'limón');
    assert.strictEqual(f('Agua Tónica'), 'Agua Tónica');
});

test('pulido: bottleKey cubre Angostura, vermut bianco y escrituras alternativas', () => {
    assert.strictEqual(api.bottleKey('Angostura'), 'angostura');
    assert.strictEqual(api.bottleKey('Cinzano Bianco'), 'vermut bianco');
    assert.strictEqual(api.bottleKey('Vermouth dry'), 'vermut seco');
    assert.strictEqual(api.bottleKey('Vermut rosso'), 'vermut rosso');
    assert.strictEqual(api.canMake(byName('Old Fashioned'), new Set(['whisky'])), false);
    assert.strictEqual(api.canMake(byName('Old Fashioned'), new Set(['whisky', 'angostura'])), true);
});

test('pulido: ninguna receta del catalogo desborda su vaso y las equivalencias propias tienen nota', () => {
    for (const e of CAT()) {
        const it = api.catalogToMenuItem(e);
        const glassCap = { rocks: 250, highball: 350, pint: 470, balloon: 550 }[it.glassId];
        const fixed = it.ingredients.filter(i => !i.autoFill).reduce((a, i) => a + i.pourMl, 0);
        assert.ok(fixed + it.iceGrams * 0.85 <= glassCap, e.name + ' ' + (fixed + it.iceGrams * 0.85) + ' > ' + glassCap);
    }
    for (const n of ['Mojito', 'Espresso Martini', 'Cosmopolitan', 'Cinzano con soda', 'Moscow Mule']) {
        assert.ok(byName(n).note.length > 0, n + ' sin nota');
    }
});

test('pulido: un item de la carta que pasa a "Otros" ya trae rendimiento y precio por defecto', () => {
    const base0 = item('cocktail', 'gin-tonic', 100);
    assert.strictEqual(base0.otherUsesPerPack, 100);
    assert.strictEqual(base0.otherPackPrice, 6000);
    assert.strictEqual(base0.fruitName, '');
    const sinCampos = { ...base0 };
    delete sinCampos.otherUsesPerPack;
    delete sinCampos.otherPackPrice;
    const r = api.calculateCanchero(cstate([{ ...sinCampos, fruitType: 'Otros', fruitName: 'A', slicesPerDrink: 2 }]));
    assert.strictEqual(r.citrus.find(c => c.other).packs, 6); // 300 tragos x 2 usos / 100 por envase
    assert.strictEqual(api.defaultMenu().every(i => i.otherUsesPerPack === 100), true);
});

// ---------------- Bebidas sin alcohol para los invitados (aparte de los tragos y la carta) ----------------

const soft = (name, ml, n, price) => ({ id: 's-' + name, name, bottleMl: ml, bottles: n, price });

test('bebidas sin alcohol: apagadas no suman nada aunque haya items cargados', () => {
    const s = base({ softOn: false, softDrinks: [soft('Coca-Cola', 2250, 12, 3200)] });
    const r = api.calculate(s);
    assert.deepStrictEqual(plain([r.soft.cost, r.soft.totalBottles, r.soft.totalLiters, r.soft.items.length]), [0, 0, 0, 0]);
    assert.strictEqual(r.budget.supplyCost, api.calculate(base()).budget.supplyCost);
});

test('bebidas sin alcohol: encendidas suman botellas, litros y costo', () => {
    const s = base({ softOn: true, softDrinks: [soft('Coca-Cola', 2250, 12, 3200), soft('Agua', 2000, 6, 1500)] });
    const r = api.calculate(s);
    assert.strictEqual(r.soft.totalBottles, 18);
    assert.ok(Math.abs(r.soft.totalLiters - (12 * 2.25 + 6 * 2)) < 1e-9);
    assert.strictEqual(r.soft.cost, 12 * 3200 + 6 * 1500);
    assert.deepStrictEqual(plain(r.soft.items.map(i => [i.name, i.bottles, i.subtotal])), [['Coca-Cola', 12, 38400], ['Agua', 6, 9000]]);
});

test('bebidas sin alcohol: entran en el presupuesto de Principiante y de El Canchero', () => {
    const extra = { softOn: true, softDrinks: [soft('Coca-Cola', 2250, 12, 3200)] };
    const p0 = api.calculate(base()).budget.supplyCost;
    const p1 = api.calculate(base(extra)).budget.supplyCost;
    assert.strictEqual(p1 - p0, 38400);
    const menu = api.defaultMenu();
    const c0 = api.calculateCanchero(cstate(menu)).budget.supplyCost;
    const rc = api.calculateCanchero(cstate(menu, extra));
    assert.strictEqual(rc.budget.supplyCost - c0, 38400);
    assert.strictEqual(rc.soft.totalBottles, 12);
});

test('bebidas sin alcohol: la sugerencia reparte litros por invitado entre las bebidas', () => {
    const s = base({ guests: 100, softLitersPerGuest: 0.5, softOn: true, softDrinks: [soft('Cola', 2250, 0, 3200), soft('Gaseosa', 1500, 0, 2500)] });
    assert.deepStrictEqual(plain(api.suggestSoftBottles(s)), [12, 17]); // 25 L cada una: 11,1 -> 12 y 16,7 -> 17
    assert.deepStrictEqual(plain(api.suggestSoftBottles(base({ softDrinks: [] }))), []);
});

test('bebidas sin alcohol: no son bebidas de la carta y no salen en el menu del PDF', () => {
    const ev = api.makeEvent('E', base({ softOn: true, softDrinks: [soft('Coca-Cola', 2250, 12, 3200)] }), 'principiante');
    const text = JSON.stringify(api.buildMenuModel(ev));
    assert.ok(!/coca/i.test(text), 'la gaseosa no debe estar en el menu');
});

test('bebidas sin alcohol: los datos rotos se sanean', () => {
    const s = api.sanitizeState({
        softOn: 'si', softLitersPerGuest: 99,
        softDrinks: [{ name: { toString: 1 }, bottleMl: 1500, bottles: 2, price: 100 }, null, 5,
            { name: 'x'.repeat(200), bottleMl: -5, bottles: 99999, price: 'abc' }]
    });
    assert.strictEqual(s.softOn, false);
    assert.ok(s.softLitersPerGuest <= 5);
    assert.strictEqual(s.softDrinks.length, 2);
    assert.ok(s.softDrinks.every(d => d.name.length > 0 && d.name.length <= 40 && d.bottleMl >= 50 && d.bottles >= 0 && d.bottles <= 1000 && d.price >= 0));
    assert.strictEqual(api.sanitizeState({ softDrinks: Array.from({ length: 50 }, (_, i) => ({ name: 'b' + i })) }).softDrinks.length, 20);
    assert.deepStrictEqual(plain(api.getDefaultState().softDrinks), []);
    assert.strictEqual(api.getDefaultState().softOn, false);
});

test('bebidas sin alcohol: no inflan el costo por trago (no son tragos)', () => {
    const sin = api.calculate(base()).budget;
    const con = api.calculate(base({ softOn: true, softDrinks: [soft('Coca-Cola', 2250, 12, 3200)] })).budget;
    assert.ok(Math.abs(con.costPerDrink - sin.costPerDrink) < 1e-9);
    assert.ok(con.totalCost > sin.totalCost);
});

// ----- Checklists: equipamiento y lista de compras tildable -----
const gearIds = (s, level = 'principiante') => api.buildGearList(s, level).map(g => g.id);

test('equipamiento: el Mojito pide mortero y hielo picado; el Gin Tonic no', () => {
    const mojito = base({ activeRecipe: 'mojito', ingredients: api.RECIPES['mojito'].ingredients.map(x => ({ ...x })), fruitType: 'Limas' });
    assert.ok(gearIds(mojito).includes('muddler'));
    assert.ok(gearIds(mojito).includes('hielo-picado'));
    assert.ok(!gearIds(base()).includes('muddler'));
});

test('equipamiento: el Negroni pide vaso mezclador y pelador; el Margarita, coctelera', () => {
    const neg = base({ activeRecipe: 'negroni', ingredients: api.RECIPES['negroni'].ingredients.map(x => ({ ...x })), fruitType: 'Sin guarnición' });
    assert.ok(gearIds(neg).includes('mezclador') && gearIds(neg).includes('pelador'));
    const mar = base({ activeRecipe: 'margarita', ingredients: api.RECIPES['margarita'].ingredients.map(x => ({ ...x })) });
    assert.ok(gearIds(mar).includes('shaker') && gearIds(mar).includes('colador'));
});

test('equipamiento: siempre trae lo básico y los cítricos piden cuchillo y exprimidor', () => {
    const ids = gearIds(base({ fruitType: 'Limas' }));
    ['jigger', 'barspoon', 'pala-hielo', 'conservadora', 'trapos', 'residuos', 'cuchillo', 'exprimidor'].forEach(i => assert.ok(ids.includes(i), i));
    assert.ok(!gearIds(base({ fruitType: 'Sin guarnición' })).includes('cuchillo'));
});

test('equipamiento: el Canchero mira solo los ítems de la carta con más de 0%', () => {
    const m = api.defaultMenu();
    const withMojito = base({ menu: m.map((it, i) => ({ ...it, sharePct: i === 0 ? 100 : 0 })) });
    const ids = gearIds(withMojito, 'canchero');
    assert.ok(ids.includes('menu'));
    const beer = api.makeMenuItem('beer'); beer.sharePct = 50;
    assert.ok(gearIds(base({ menu: [beer] }), 'canchero').includes('balde-latas'));
    assert.ok(!gearIds(base({ menu: [{ ...beer, sharePct: 0 }] }), 'canchero').includes('balde-latas'));
});

test('equipamiento: bebidas sin alcohol piden jarras y la cristalería pide bandejas', () => {
    assert.ok(gearIds(base({ softOn: true })).includes('jarras'));
    assert.ok(!gearIds(base()).includes('jarras'));
    assert.ok(gearIds(base({ vesselMode: 'glassware' })).includes('bandejas'));
    assert.ok(!gearIds(base({ vesselMode: 'disposable' })).includes('bandejas'));
});

test('lista de compras: coincide con las cantidades del resumen (Principiante)', () => {
    const s = base();
    const res = api.calculate(s);
    const list = api.buildShoppingList(res, 'principiante');
    res.computedIngredients.forEach(i => assert.ok(list.some(x => x.group === 'Bebidas' && x.qty === i.bottlesToBuy), i.name));
    assert.ok(list.some(x => x.group === 'Hielo' && x.qty === res.ice.totalIceBags));
    assert.strictEqual(new Set(list.map(x => x.id)).size, list.length, 'ids únicos');
    assert.ok(list.every(x => x.qty > 0));
});

test('lista de compras: coincide con las compras unidas del Canchero y suma las sin alcohol', () => {
    const s = base({ menu: api.defaultMenu(), softOn: true, softDrinks: [{ id: 'a', name: 'Agua', bottleMl: 2000, bottles: 6, price: 1000 }] });
    const res = api.calculateCanchero(s);
    const list = api.buildShoppingList(res, 'canchero');
    res.purchases.forEach(p => assert.ok(list.some(x => x.group === 'Bebidas' && x.qty === p.bottles), p.name));
    assert.ok(list.some(x => x.group === 'Sin alcohol' && x.qty === 6));
});

test('lista de compras: ítems sin cantidad no aparecen', () => {
    const res = api.calculate(base({ includeExtras: false }));
    const list = api.buildShoppingList(res, 'principiante');
    assert.ok(!list.some(x => x.group === 'Descartables'));
});

test('checklists: las tildes y el equipamiento propio se limpian al sanear', () => {
    assert.deepStrictEqual(plain(api.sanitizeChecks({ a: true, b: false, c: 'si', ['x'.repeat(91)]: true })), { a: true });
    assert.deepStrictEqual(plain(api.sanitizeChecks(['a'])), {});
    assert.deepStrictEqual(plain(api.sanitizeChecks(null)), {});
    const big = {}; for (let i = 0; i < 500; i++) big['k' + i] = true;
    assert.strictEqual(Object.keys(api.sanitizeChecks(big)).length, 200);
    const extra = api.sanitizeGearExtra([{ label: 'Alargue' }, { label: ' alargue ' }, { label: '' }, null, 5, { label: 'Mantel' }]);
    assert.deepStrictEqual(plain(extra.map(x => x.label)), ['Alargue', 'Mantel']);
    assert.strictEqual(api.sanitizeGearExtra('no').length, 0);
    assert.strictEqual(api.sanitizeGearExtra(Array.from({ length: 80 }, (_, i) => ({ label: 'Item ' + i }))).length, 30);
});

test('checklists: se guardan en el estado y un estado roto vuelve a vacío', () => {
    const s = api.sanitizeState({ shopDone: { a: true }, gearDone: { b: true }, gearExtra: [{ label: 'Hielera' }] });
    assert.deepStrictEqual(plain(s.shopDone), { a: true });
    assert.deepStrictEqual(plain(s.gearDone), { b: true });
    assert.strictEqual(s.gearExtra[0].label, 'Hielera');
    const bad = api.sanitizeState({ shopDone: 'no', gearDone: 5, gearExtra: { a: 1 } });
    assert.deepStrictEqual(plain(bad.shopDone), {});
    assert.deepStrictEqual(plain(bad.gearExtra), []);
});

test('checklists: no cambian el presupuesto del cliente', () => {
    const a = api.calculate(base());
    const b = api.calculate(base({ shopDone: { x: true }, gearDone: { y: true }, gearExtra: [{ id: 'x-z', label: 'Z' }] }));
    assert.strictEqual(a.budget.totalCost, b.budget.totalCost);
    assert.strictEqual(a.budget.finalClientPrice, b.budget.finalClientPrice);
});

// ----- Pantalla de inicio: sesiones guardadas -----
test('sesiones: un evento recien creado no cuenta como guardado; uno con cliente o cambios si', () => {
    const fresh = api.sanitizeStore(null);
    assert.strictEqual(api.sessionsSummary(fresh).filter(s => s.used).length, 0);
    const withClient = api.sanitizeStore(null);
    withClient.events[0].client = 'Ana';
    assert.strictEqual(api.sessionsSummary(withClient).filter(s => s.used).length, 1);
    const changed = api.sanitizeStore(null);
    changed.events[0].state.guests = 80;
    assert.ok(api.sessionsSummary(changed)[0].used);
    const renamed = api.sanitizeStore(null);
    renamed.events[0].name = 'Boda de Lu';
    assert.ok(api.sessionsSummary(renamed)[0].used);
});

test('sesiones: marca el evento activo, el nivel, y aguanta datos rotos', () => {
    const st = api.sanitizeStore(null);
    st.events.push(api.makeEvent('Evento Canchero 1', {}, 'canchero'));
    const list = api.sessionsSummary(st);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list.filter(s => s.active).length, 1);
    assert.strictEqual(list[1].level, 'canchero');
    assert.ok(list[1].used, 'un Canchero siempre cuenta como guardado');
    assert.deepStrictEqual(plain(api.sessionsSummary(null)), []);
    assert.deepStrictEqual(plain(api.sessionsSummary({ events: 'no' })), []);
});

// ----- Menu Play: historial por fecha y continuar -----
test('historial: daysUntil cuenta dias de calendario y rechaza fechas invalidas', () => {
    assert.strictEqual(api.daysUntil('2026-11-20', '2026-11-18'), 2);
    assert.strictEqual(api.daysUntil('2026-11-18', '2026-11-18'), 0);
    assert.strictEqual(api.daysUntil('2026-11-17', '2026-11-18'), -1);
    assert.strictEqual(api.daysUntil('2027-01-01', '2026-12-31'), 1);
    assert.strictEqual(api.daysUntil('', '2026-11-18'), null);
    assert.strictEqual(api.daysUntil('no', '2026-11-18'), null);
});

test('historial: primero las proximas (de la mas cercana), luego las pasadas (la mas reciente), al final sin fecha', () => {
    const list = [
        { id: 'a', date: '2026-10-01' }, { id: 'b', date: '' }, { id: 'c', date: '2026-12-25' },
        { id: 'd', date: '2026-11-18' }, { id: 'e', date: '2026-11-01' }, { id: 'f', date: '2026-11-30' }
    ];
    const out = api.historyOrder(list, '2026-11-18');
    assert.deepStrictEqual(out.map(s => s.id), ['d', 'f', 'c', 'e', 'a', 'b']);
    assert.strictEqual(out[0].days, 0);
    assert.strictEqual(out[3].days, -17);
    assert.strictEqual(out[5].days, null);
    assert.deepStrictEqual(plain(api.historyOrder(null, '2026-11-18')), []);
    assert.ok(!('_i' in out[0]), 'no deja campos internos');
});

test('continuar: solo hay cotizacion a medias si el evento activo ya fue tocado', () => {
    const fresh = api.sanitizeStore(null);
    assert.strictEqual(api.inProgressSession(fresh), null);
    const used = api.sanitizeStore(null);
    used.events[0].client = 'Ana';
    assert.strictEqual(api.inProgressSession(used).client, 'Ana');
    const other = api.sanitizeStore(null);
    other.events[0].client = 'Ana';
    other.events.push(api.makeEvent('Evento 2', api.getDefaultState(), 'principiante'));
    other.activeId = other.events[1].id;
    assert.strictEqual(api.inProgressSession(other), null, 'el activo sin tocar no cuenta aunque haya otros guardados');
    assert.strictEqual(api.inProgressSession(null), null);
});

// ----- Música de fondo generada por código -----
test('musica: midiToFreq usa la afinacion estandar (La4 = 440 Hz)', () => {
    assert.strictEqual(api.midiToFreq(69), 440);
    assert.ok(Math.abs(api.midiToFreq(60) - 261.6256) < 0.01);
});

test('musica: la progresion tiene 4 acordes y todas las notas suenan en rango suave', () => {
    assert.strictEqual(api.MUSIC_CHORDS.length, 4);
    api.MUSIC_CHORDS.forEach(c => {
        assert.ok(api.midiToFreq(c.bass) >= 40 && api.midiToFreq(c.bass) <= 100, 'bajo grave');
        assert.ok(c.pad.length >= 3);
        c.pad.forEach(n => assert.ok(api.midiToFreq(n) > 150 && api.midiToFreq(n) < 500, 'colchon medio'));
    });
    api.MUSIC_MELODY.forEach(n => assert.ok(api.midiToFreq(n) > 400 && api.midiToFreq(n) < 1100, 'melodia aguda pero suave'));
});

test('musica: la melodia solo usa notas de la pentatonica de Do (no choca con los acordes)', () => {
    const pentatonic = new Set([0, 2, 4, 7, 9]);
    api.MUSIC_MELODY.forEach(n => assert.ok(pentatonic.has(n % 12), 'nota ' + n));
});

// ---------------- Bebidas libres y precio de fruta por receta ----------------

test('fruta por receta: cada receta usa su propio precio por kg', () => {
    const a = item('cocktail', 'gin-tonic', 50, { fruitPriceKg: 2000 });  // Limas
    const b = item('cocktail', 'campari', 50, { fruitPriceKg: 5000 });    // Naranjas
    const r = api.calculateCanchero(cstate([a, b], { fruitPriceKg: 1 }));
    const by = Object.fromEntries(r.citrus.map(c => [c.fruitType, c]));
    assert.ok(Math.abs(by.Limas.cost - 3.04 * 2000) < 1e-6);
    assert.ok(Math.abs(by.Naranjas.cost - 9.5 * 5000) < 1e-6);
    assert.strictEqual(by.Limas.weightG, 80);
    assert.strictEqual(by.Limas.slicesPerFruit, 8);
});

test('fruta por receta: sin precio propio usa el del evento (ítems viejos)', () => {
    const a = item('cocktail', 'gin-tonic', 100);
    assert.strictEqual(a.fruitPriceKg, undefined);
    const r = api.calculateCanchero(cstate([a], { fruitPriceKg: 1000 }));
    assert.ok(Math.abs(r.citrus[0].cost - r.citrus[0].kgNeeded * 1000) < 1e-9);
});

test('fruta por receta: la misma fruta con precios distintos se promedia y no se pierde', () => {
    const a = item('cocktail', 'gin-tonic', 50, { fruitPriceKg: 1000 });
    const b = item('cocktail', 'cuba-libre', 50, { fruitPriceKg: 3000 });
    const r = api.calculateCanchero(cstate([a, b]));
    assert.strictEqual(r.citrus.length, 1);
    assert.ok(Math.abs(r.citrus[0].priceKg - 2000) < 1e-6);
});

test('fruta propia: "Otra fruta" se compra por kg con sus rodajas y peso', () => {
    const it = item('cocktail', 'gin-tonic', 100, {
        fruitType: 'Otra fruta', fruitName: 'Pomelo', slicesPerDrink: 2, slicesPerFruit: 6, fruitWeightG: 400, fruitPriceKg: 2500
    });
    const r = api.calculateCanchero(cstate([it]));
    const c = r.citrus[0];
    assert.strictEqual(c.fruitType, 'Pomelo');
    assert.strictEqual(c.totalSlices, 600);
    assert.strictEqual(c.fruitsNeeded, 100);
    assert.ok(Math.abs(c.kgNeeded - 40) < 1e-9);
    assert.ok(Math.abs(c.cost - 100000) < 1e-6);
    assert.ok(Math.abs(r.items[0].garnish[0].cost - 100000) < 1e-6);
});

test('guarniciones extra: se suman a la principal, cada una con su dato', () => {
    const it = item('cocktail', 'gin-tonic', 100, {
        extraGarnish: [{ fruitType: 'Naranjas', slicesPerDrink: 1, fruitPriceKg: 1000 }, { fruitType: 'Otros', fruitName: 'Angostura', slicesPerDrink: 2, otherUsesPerPack: 100, otherPackPrice: 6000 }]
    });
    const r = api.calculateCanchero(cstate([it]));
    const names = r.citrus.map(c => c.fruitType).sort();
    assert.deepStrictEqual(names, ['Angostura', 'Limas', 'Naranjas']);
    assert.strictEqual(r.items[0].garnish.length, 3);
});

test('trago inventado: ingredientes libres y sin guarnición es una receta válida', () => {
    const it = api.makeBlankCocktail();
    it.sharePct = 100;
    it.ingredients.push({ id: 'x', name: 'Jugo de maracuyá', pourMl: 60, autoFill: false, bottleMl: 1000, price: 3000, abv: 0 });
    const r = api.calculateCanchero(cstate([it]));
    assert.strictEqual(r.citrus.length, 0);
    assert.strictEqual(r.purchases.length, 2);
    assert.ok(Number.isFinite(r.items[0].costPerServing));
    assert.strictEqual(r.items[0].garnish.filter(Boolean).length, 0);
});

test('sanear ítem: guarda confirmación, extras (máx. 4) y datos de fruta; un ítem viejo sigue funcionando', () => {
    const s = api.sanitizeMenuItem({
        kind: 'cocktail', name: 'X', confirmed: true, fruitType: 'Otra fruta', fruitName: 'Frutilla', slicesPerDrink: 3,
        slicesPerFruit: 9999, fruitWeightG: -4, fruitPriceKg: 'abc',
        extraGarnish: Array.from({ length: 9 }, () => ({ fruitType: 'Limas', slicesPerDrink: 1 }))
    });
    assert.strictEqual(s.confirmed, true);
    assert.strictEqual(s.extraGarnish.length, 4);
    assert.strictEqual(s.slicesPerFruit, 100);
    assert.strictEqual(s.fruitWeightG, 1);
    assert.strictEqual(s.fruitPriceKg, 0);
    const old = api.sanitizeMenuItem({ kind: 'cocktail', name: 'Viejo', fruitType: 'Limones', slicesPerDrink: 2 });
    assert.strictEqual(old.confirmed, false);
    assert.strictEqual(old.fruitPriceKg, undefined);
    assert.strictEqual(old.slicesPerFruit, 7);
    assert.strictEqual(api.sanitizeMenuItem({ kind: 'cocktail', fruitType: 'Inventada' }).fruitType, 'Sin guarnición');
});
