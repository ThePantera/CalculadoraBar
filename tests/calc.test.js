// Pruebas del motor de cálculo. Ejecutar:  node --test tests/
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
             calculateCanchero, makeMenuItem, defaultMenu, sanitizeMenuItem, MENU_KINDS };`, ctx);
const api = ctx.api;

const base = (over = {}) => ({ ...api.getDefaultState(), ...over });
const plain = o => JSON.parse(JSON.stringify(o));

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
    const b = api.calculate(base({ guests: 100, eventHours: 4, staffRate: 5000 })).budget;
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
