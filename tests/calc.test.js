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
             mergeImportedEvents, computeBudget, makeEvent };`, ctx);
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
