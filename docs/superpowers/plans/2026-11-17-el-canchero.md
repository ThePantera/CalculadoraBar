# El Canchero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el nivel "El Canchero" (carta mixta con varios tragos, cerveza, vino y sin alcohol, compras unidas y notas "¿Por qué?") sin cambiar la pantalla de inicio "Principiante".

**Architecture:** Cada evento tiene `level` (`principiante` | `canchero`). El motor puro (`// <ENGINE>` en `index.html`) gana `calculateCanchero(s)` y una función de presupuesto compartida con `calculate(s)`. La interfaz alterna vistas con `document.body.dataset.level` y clases `only-p` / `only-c`; la columna derecha (resumen y presupuesto) es compartida y se llena según el nivel.

**Tech Stack:** HTML + CSS + JavaScript vanilla en un solo `index.html`, sin dependencias. Pruebas en `tests/calc.test.js` (node:test); en este equipo **no hay Node**, así que se verifican en el navegador.

**Spec:** `docs/superpowers/specs/2026-11-17-el-canchero-design.md`

## Global Constraints

- Un solo `index.html`, sin librerías ni CDN (consigna del curso). Funciona sin conexión.
- Principiante no cambia: los resultados de `calculate(getDefaultState())` deben ser idénticos antes y después (120 tragos, gin 8 envases, hielo 3 bolsas, etc.).
- Clave de guardado: `bar_manager_pro_events_v3`. Los datos viejos sin `level` ni `menu` se leen como Principiante.
- Textos en español rioplatense (voseo), como el resto de la app. Vasos con nombre de barra, alias entre paréntesis y ícono "i" de 16 px (ya existe `GLASS_TYPES` y `glassById`).
- Auto-completar: múltiplos de 5 ml hacia abajo (`computeAutoFillMl`). Colchón de botellas del perfil se aplica a las compras.
- Los valores por defecto son referencias editables, no datos de mercado (decirlo en la UI y la documentación).
- Marcadores del motor `// <ENGINE>` y `// </ENGINE>` se conservan: los tests extraen ese bloque.
- Verificación sin Node: servir con `powershell -NoProfile -ExecutionPolicy Bypass -File <scratchpad>\serve.ps1` (puerto 8765), abrir `http://localhost:8765/index.html` con las herramientas de Chrome y evaluar las mismas aserciones con `javascript_tool`. Cerrar pestaña y servidor al terminar.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No hacer `git push` sin que el dueño lo confirme.

## Review Focus

1. Carta que no suma 100% (por ejemplo 70% o 150%): se normaliza, se avisa, sin `NaN` (Task 2 y 4).
2. Carta vacía o con todos los porcentajes en 0: cero tragos, sin división por cero ni caída de la pantalla (Task 2).
3. Mismo ingrediente con distinto tamaño de envase o escrito con otras mayúsculas ("GIN " vs "gin"): se une solo si el nombre normalizado y el envase coinciden (Task 2).
4. Ítem sin vaso (lata, `glassId: 'none'`) con porcentaje: no suma vasos ni hielo de servicio y no rompe el auto-completar (Task 2).
5. Evento viejo sin `level`/`menu`, respaldo JSON sin `level`, o `menu` corrupto (no es arreglo, ítems basura): se sanea y se abre como Principiante sin perder datos (Task 1).

---

## File Structure

- Modify: `index.html` — motor (`ENGINE`), HTML de pestañas, vista Canchero, JS de interfaz.
- Modify: `tests/calc.test.js` — pruebas del motor nuevo.
- Modify: `Documentacion.md`, `README.md` — sección El Canchero y valores de referencia.
- Create: este plan y el spec (ya existe).

---

### Task 1: Nivel por evento y presupuesto compartido (motor)

**Files:**
- Modify: `index.html` (bloque ENGINE: `calculate`, `makeEvent`, `sanitizeEvent`, `sanitizeState`, `mergeImportedEvents`, `migrateLegacyState`)
- Test: `tests/calc.test.js`

**Interfaces:**
- Produces: `computeBudget(s, supplyCost, guests, totalDrinks, staff) -> { supplyCost, otherCosts, staffCost, depositAmount, totalCost, costPerGuest, costPerDrink, marginPct, priceNet, ivaPct, finalClientPrice, netProfit, realMarginPct, markupPct }` (mismos campos que hoy en `calculate(...).budget`).
- Produces: `makeEvent(name, state, level = 'principiante')`; todo evento tiene `level` en `'principiante' | 'canchero'`.
- Produces: `state.menu` (arreglo, por defecto `[]`) aceptado por `sanitizeState`.

- [ ] **Step 1: Write the failing tests** — `presupuesto compartido`: `calculate(base()).budget` sigue valiendo lo mismo que antes (`totalCost`, `finalClientPrice` del estado por defecto guardados como constantes calculadas antes del cambio); `evento sin level se abre como principiante` (`sanitizeStore({events:[{id:'a',state:{}}]}).events[0].level === 'principiante'`); `level inválido ('x') cae a principiante`; `makeEvent('X', {}, 'canchero').level === 'canchero'`; `respaldo sin level se importa como principiante` (`mergeImportedEvents`); `menu corrupto` (`sanitizeState({menu:'no'}).menu` es `[]`, `sanitizeState({menu:[5,null]}).menu` es `[]`).
- [ ] **Step 2: Run tests (browser) to verify they fail** — esperado: fallan por `level`/`menu` indefinidos.
- [ ] **Step 3: Implement** `computeBudget` extrayendo de `calculate` el bloque "Presupuesto" (margen markup/sobre venta con tope 90%, IVA, seña); `calculate` lo llama. Agregar `level` a `makeEvent`/`sanitizeEvent`; `sanitizeState` copia `menu` solo si es arreglo (el saneo de ítems llega en Task 2: aquí filtra a `[]` los elementos que no sean objetos).
- [ ] **Step 4: Run tests to verify they pass** — esperado: todas las pruebas anteriores (30+ de v2/v3) y las nuevas en OK.
- [ ] **Step 5: Commit** — `git add index.html tests/calc.test.js && git commit -m "Motor: nivel por evento y presupuesto compartido"`.

### Task 2: Carta mixta y `calculateCanchero` (motor)

**Files:**
- Modify: `index.html` (bloque ENGINE)
- Test: `tests/calc.test.js`

**Interfaces:**
- Consumes: `computeAutoFillMl`, `iceGramsFor`, `iceBaseForCapacity`, `RECIPES`, `GLASS_TYPES`, `FRUITS`, `staffSuggestion`, `computeBudget`.
- Produces: `MENU_KINDS = { cocktail, beer, wine, soft }` con valores iniciales — `beer`: porción 473 ml, envase 473 ml (lata), precio 1500, abv 5, `glassId 'none'`, hielo 0; `wine`: 150 ml, 750 ml, precio 6000, abv 12.5, `glassId 'balloon'`, hielo 0; `soft`: 300 ml, 1500 ml, precio 2500, abv 0, `glassId 'highball'`, hielo `iceGramsFor(350,'normal')`.
- Produces: `makeMenuItem(kind, recipeKey?) -> { id, kind, name, sharePct, glassId, ingredients[], iceGrams, fruitType, slicesPerDrink }` (para `cocktail` copia la receta de `RECIPES[recipeKey]`, con su vaso y fruta; `iceGrams = iceGramsFor(capacidad del vaso, 'normal')`).
- Produces: `defaultMenu() -> item[]` = Gin Tonic 40, Fernet con Coca 30, Cerveza (lata) 20, Sin alcohol 10.
- Produces: `sanitizeMenuItem(raw) -> item | null` (porcentaje 0-100, `glassId` válido o `'none'`, ingredientes saneados como en `sanitizeState`, máximo 20 ítems por carta).
- Produces: `calculateCanchero(s) -> { guests, totalTragos: totalDrinks, shareTotal, shareWarning, items:[{id,name,kind,drinks,costPerServing,glassId}], purchases:[{name,bottleMl,bottles,totalMl,uses:[{itemName,ml}],subtotal,leftoverMl}], ice:{serviceBags,coolerBags,totalIceBags,totalIceKgBought,bagKg,cost,suggestedCoolerBags}, citrus:[{fruitType,totalSlices,fruitsNeeded,kgNeeded,cost}], vessels:{mode,groups:[{glassId,name,units}],totalUnits,packsToBuy,packQty,cost}, extras, staff, budget }`.

Reglas pinneadas: drinks del ítem `= T × share / Σshare` (sin redondear por ítem; `T = ceil(guests × drinksPerGuest)`); compras unidas por clave `nombre.trim().toLowerCase() + '|' + bottleMl`, con precio del primer ingrediente; envases `ceil(Σml × (1 + colchón) / bottleMl − 1e-9)`; auto-completar con vaso e hielo del propio ítem; hielo servicio `Σ drinks × iceGrams / 1000 × thermalFactor`; `suggestedCoolerBags = ceil(litros de cerveza+vino+sin alcohol × 0.5 / bagKg)` (solo referencia, `coolerBags` sigue manual); cristalería por tipo `ceil(guests × rotation × (1 + rotura) × Σshare del vaso / Σshare total)`, `none` no cuenta; descartables `ceil(T × (uso + reposición) × Σshare con vaso / Σshare total)` y packs sobre el total; cítricos agrupados por `fruitType`; extras y personal iguales que Principiante.

- [ ] **Step 1: Write the failing tests** — con `guests:100, drinksPerGuest:3`:
  - `unir compras`: carta Gin Tonic 50 + Negroni 50 (receta con gin 45 y 30 ml, envase 750) → `purchases` tiene **una** fila de gin con `bottles === 15`, `uses` = `[{Gin Tonic, 6750}, {Negroni, 4500}]`.
  - `normaliza`: carta 40 + 30 (suma 70) → `drinks` de los ítems `= 300×40/70` y `300×30/70`, `shareWarning` verdadero, sin `NaN`.
  - `carta vacía` y `todo en 0%`: `totalTragos` 300 pero `items` sin tragos, `budget.totalCost` finito y `purchases` vacío.
  - `nombre y envase`: `'GIN '` y `'gin'` con envase 750 se unen; mismo nombre con envase 1000 **no** se une.
  - `sin vaso`: carta Gin Tonic 50 (highball) + Negroni 30 (rocks) + Cerveza lata 20 (`none`), cristalería rotación 1.5, rotura 10% → grupos `highball: 83`, `rocks: 50`, sin grupo `none`.
  - `hielo`: cerveza (`iceGrams 0`) no suma bolsas de servicio.
  - `carta por defecto` (`defaultMenu()`) da resultados finitos y `purchases` sin duplicados de nombre+envase.
  - `sanitizeMenuItem`: ítem basura devuelve `null`; porcentaje 500 se recorta a 100; más de 20 ítems se recortan a 20.
- [ ] **Step 2: Run tests (browser) to verify they fail** — esperado: `calculateCanchero is not defined`.
- [ ] **Step 3: Implement** las funciones y constantes de Interfaces dentro del bloque ENGINE; agregar `menu` a `getDefaultState()` como `[]` y saneo con `sanitizeMenuItem` en `sanitizeState`. `calculateCanchero` reutiliza `computeBudget` y `staffSuggestion`.
- [ ] **Step 4: Run tests to verify they pass** — esperado: todo OK, incluidas las pruebas de Task 1.
- [ ] **Step 5: Commit** — `git commit -m "Motor: carta mixta y calculateCanchero"`.

### Task 3: Pestañas, eventos con nivel y vistas (interfaz)

**Files:**
- Modify: `index.html` (HTML de cabecera y tarjeta de eventos; CSS; JS de eventos)

**Interfaces:**
- Consumes: `activeEvent()`, `switchEvent(id)`, `makeEvent(name, state, level)`, `defaultMenu()`, `getDefaultState()`.
- Produces: `document.body.dataset.level` (`'principiante'` | `'canchero'`) actualizado en `refreshAll()`; clases CSS `.only-p` / `.only-c` (ocultas con `body[data-level=...] ... { display:none !important }`); ids `tabPrincipiante`, `tabCanchero`, `btnNewCanchero`; función `isCanchero() -> boolean`.

- [ ] **Step 1: Define la verificación en el navegador** — esperado tras implementar: al abrir sin datos, `body.dataset.level === 'principiante'`; la vista Principiante es idéntica a la actual (mismas tarjetas visibles); clic en `tabCanchero` crea "Evento Canchero 1" con `menu = defaultMenu()` y `body.dataset.level === 'canchero'`; clic de vuelta en `tabPrincipiante` abre el primer evento Principiante sin modificarlo; el selector de eventos muestra `🎩 ` delante de los Canchero; `btnNewCanchero` agrega otro.
- [ ] **Step 2: Implement** — mover la tarjeta "Mis eventos" fuera de `.controls-column` a un bloque de ancho completo sobre `.main-grid`; agregar pestañas con los ids de Interfaces; marcar `only-p` en: pastillas de recetas, tarjeta "Tipo de Vaso", tarjeta "Bebidas e Ingredientes", fila de nivel/gramos de hielo y nota base, y subsección de cítricos; marcar `only-c` en la tarjeta "Carta del evento" (contenedor vacío `#menuCard`, se llena en Task 4). `refreshAll()` fija `body.dataset.level` según `activeEvent().level`. La cristalería, ajustes avanzados, presupuesto y logística de hielo quedan compartidos.
- [ ] **Step 3: Run verification (browser)** — esperado: lo descrito en Step 1, sin errores de consola.
- [ ] **Step 4: Commit** — `git commit -m "Interfaz: pestañas y eventos con nivel"`.

### Task 4: Editor de la carta (interfaz)

**Files:**
- Modify: `index.html` (HTML de `#menuCard`, CSS, JS)

**Interfaces:**
- Consumes: `makeMenuItem(kind, recipeKey)`, `MENU_KINDS`, `RECIPES`, `GLASS_TYPES` (más la opción `'none'` "Sin vaso (lata o botella)"), `state.menu`, `updateCalculations()`.
- Produces: `renderMenuEditor()`; ids `menuList`, `btnAddMenuItem` (con selector de tipo y de receta), `menuShareTotal`.

- [ ] **Step 1: Define la verificación en el navegador** — esperado: la carta por defecto muestra 4 ítems con 40/30/20/10 y `menuShareTotal` en 100% ✓; cambiar un porcentaje actualiza el total y, si ≠ 100, muestra "se reparte proporcionalmente" (aviso, no error); agregar un ítem de cada tipo y eliminarlo funciona; cada ítem muestra su costo por porción; editar un ingrediente o el vaso actualiza el resumen; ingredientes de cócteles y porciones muestran el equivalente oz/cl (`mlLabel`).
- [ ] **Step 2: Implement** — una tarjeta compacta por ítem (nombre, tipo, % de consumo, vaso, y según tipo: receta con ingredientes o solo porción/envase/precio/abv). Los eventos de input modifican `state.menu[i]` con `clampNum` y llaman a `updateCalculations()`; los cambios de estructura (agregar, quitar, cambiar tipo) re-renderizan con `renderMenuEditor()`. Máximo 20 ítems (aviso con `showToast`).
- [ ] **Step 3: Run verification (browser)** — esperado: lo descrito, incluyendo la carta que suma 70% y 150% sin `NaN` en pantalla.
- [ ] **Step 4: Commit** — `git commit -m "Interfaz: editor de la carta"`.

### Task 5: Resumen unido y exportaciones del Canchero (interfaz)

**Files:**
- Modify: `index.html` (`updateCalculations`, botones de copiar, impresión)

**Interfaces:**
- Consumes: `calculateCanchero(state)`, `fmtNum`, `fmtCurrency`, `glassById`, `activeEvent()`.
- Produces: `renderSummaryCanchero(res)`; `updateCalculations()` ramifica por `isCanchero()`; el bloque de presupuesto (`metricTotalCost`, `finalClientPriceDisplay`, etc.) se llena con una función común `renderBudget(budget)`.

- [ ] **Step 1: Define la verificación en el navegador** — esperado con la carta por defecto, 40 invitados × 3 tragos: el resumen lista **una fila por compra unida** con el detalle "aporta cada ítem", hielo (con "sugerencia de conservadora" como referencia), vasos por tipo (sin vaso para lata), cítricos por fruta, extras, personal y presupuesto; "Copiar lista interna" y "Copiar presupuesto para cliente" generan texto del Canchero (carta con porcentajes, sin costos internos en el del cliente); imprimir muestra el encabezado del evento; el resumen de Principiante no cambia.
- [ ] **Step 2: Implement** `renderSummaryCanchero` y `renderBudget`; separar la construcción de textos de WhatsApp por nivel; mantener el guardado automático.
- [ ] **Step 3: Run verification (browser)** — esperado: lo descrito; recargar conserva el evento Canchero activo y su carta.
- [ ] **Step 4: Commit** — `git commit -m "Interfaz: resumen unido y exportaciones del Canchero"`.

### Task 6: Notas "¿Por qué?", documentación y cierre

**Files:**
- Modify: `index.html` (bloques `<details class="why">` en la vista Canchero), `Documentacion.md`, `README.md`, `tests/calc.test.js`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Escribir las notas** — un `<details>` "💡 ¿Por qué?" (clase `only-c`) en: carta y porcentajes (por qué se normaliza a 100%), compras unidas (por qué se compra una sola vez y se redondea al final), hielo según el vaso, conservadora sugerida (es una referencia, no una regla), vasos por tipo, costo por porción. Una línea final en la vista: "Los valores son referencias editables, no datos de mercado."
- [ ] **Step 2: Documentación** — sección G en `Documentacion.md` con las reglas de cálculo del Canchero (fórmulas en LaTeX como el resto) y el cambio de modelo de datos (`level`, `menu`); actualizar `README.md` ("Qué hace").
- [ ] **Step 3: Verificación final (browser)** — ejecutar **toda** la batería de pruebas (v2, v3 y Canchero) y repetir el recorrido: evento nuevo Principiante, evento Canchero, plantilla aplicada a un Canchero (debe mantener `menu`), duplicar un Canchero (copia `level` y `menu`), exportar e importar respaldo con ambos niveles, recargar. Esperado: todo OK, sin errores de consola, Principiante idéntico al inicio.
- [ ] **Step 4: Commit local** — `git add -A && git commit -m "El Canchero: nivel avanzado con carta mixta"`. Preguntar al dueño antes de `git push`.

---

## Self-Review

- **Cobertura del spec:** niveles por evento (T1, T3), carta y modelo (T2, T4), compras unidas (T2, T5), vasos e hielo por ítem (T2), presupuesto compartido (T1), notas "¿Por qué?" (T6), compatibilidad de datos (T1), documentación (T6). Sin huecos.
- **Consistencia de nombres:** `calculateCanchero`, `computeBudget`, `makeMenuItem`, `defaultMenu`, `sanitizeMenuItem`, `isCanchero`, `renderMenuEditor`, `renderSummaryCanchero`, `renderBudget` se definen en el task productor y se usan igual en los demás.
- **Proporción:** el plan decide interfaces, valores y pruebas; los cuerpos de funciones y el HTML quedan para quien construye.
