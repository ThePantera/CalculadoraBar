# Documentación Técnica y Guía Operativa — Bar Manager Pro

## 1. Descripción General
**Bar Manager Pro** es una calculadora web interactiva (diseñada en un único archivo HTML5 + CSS propio + JavaScript Vanilla, sin dependencias externas: funciona sin conexión) pensada para bartenders, organizadores de eventos y servicios de barra móvil. Permite planificar con precisión matemática:
- Cantidad de botellas de destilados y mixers (gaseosas, aguas tónicas, jugos).
- Capacidad de cristalería (por categorías estándar o ingreso manual en `ml`).
- Hielo neto de servicio (gramos por vaso), merma térmica por calor ambiental y bolsas extra para conservadoras.
- Cítricos y guarniciones (en rodajas, unidades enteras y kilogramos).
- Cristalería reutilizable vs. vasos descartables (con lógicas de cálculo diferenciadas).
- Presupuesto de costos internos y cotización final con margen de ganancia para clientes.

---

## 2. Fórmulas y Reglas de Negocio Implementadas

### A. Consumo de Bebidas y Llenado del Vaso
1. **Total de Tragos ($T$):**
   $$T = \text{Invitados} \times \text{Tragos por persona}$$
2. **Desplazamiento del Hielo en el Vaso:**
   El hielo sólido ocupa aproximadamente el **85%** de su peso en volumen líquido equivalente ($1\text{ g de hielo} \approx 0.85\text{ ml}$).
   $$\text{Espacio útil líquido (ml)} = \text{Capacidad del vaso (ml)} - (\text{Gramos de hielo} \times 0.85)$$
3. **Auto-completado de Mixer (ej. Agua Tónica):**
   Si el ingrediente tiene activa la opción *"Auto-completar vaso"*, la medida por trago se calcula automáticamente restando las medidas fijas (alcoholes) al espacio útil del vaso, redondeando **hacia abajo** en múltiplos de `5 ml` (para no desbordar el vaso). Si hay varios ingredientes auto-completados, se reparten el espacio por igual.
4. **Botellas a Comprar:**
   $$\text{Botellas} = \left\lceil \frac{T \times \text{Medida por trago (ml)}}{\text{Capacidad botella (ml)}} \right\rceil$$

---

### B. Cálculo de Hielo (Servicio + Merma + Conservadora)
El sistema separa el hielo en dos categorías operativas:
1. **Hielo de Servicio (dentro del vaso):**
   Parte de una base proporcional al tamaño del vaso (desde `40 g` en vasos descartables chicos de 200 ml hasta `90 g` en copas balón de 550 ml), ajustable por nivel (*Poco* `0.7x`, *Normal* `1.0x`, *Full* `1.35x`) o de forma manual.
   $$\text{Hielo Servicio (kg)} = \frac{T \times \text{Gramos por vaso}}{1000} \times \text{Factor de Merma Térmica}$$
   * **Merma Térmica:** `1.00` (0% interior/fresco), `1.15` (+15% estándar), `1.25` (+25% verano/aire libre).
2. **Hielo de Conservadora:**
   Cantidad manual de bolsas enteras destinadas exclusivamente a enfriar botellas y latas en fraperas o conservadoras.

---

### C. Lógica Diferenciada: Cristalería vs. Vasos Descartables

El cálculo de vasos cambia radicalmente según el material utilizado en el evento:

| Modalidad | Base de Cálculo | Fórmula Aplicada | Justificación Operativa |
| :--- | :--- | :--- | :--- |
| **Cristalería / Reutilizable** | **Por Invitados** | $\lceil \text{Invitados} \times \text{Factor Rotación} \times 1.10 \rceil$ | No se necesita 1 copa por cada trago. Con bacha/lavado continuo alcanza `1.3x` por persona; estándar `1.5x`; sin lavado rápido `2.0x`. Se suma `+10%` por roturas. |
| **Vasos Descartables** | **Por Tragos Totales** | $\lceil T \times \text{Factor Base+Reposición} \rceil$ | Muchos invitados reutilizan su vaso en la segunda ronda, pero otros los pierden o aplastan. Se calcula sobre el `75%` de los tragos + `15%` de reposición (`0.90x` total) redondeado a packs de `25`, `50` o `100`. |

---

### D. Cítricos y Guarniciones
1. **Total de Rodajas:** $T \times \text{Rodajas por trago}$.
2. **Frutas Enteras:** $\lceil \text{Total de Rodajas} / \text{Rodajas que rinde cada fruta} \rceil$.
3. **Peso Total (kg):** $(\text{Frutas Enteras} \times \text{Peso unitario en gramos}) / 1000$.

---

### E. Ajustes añadidos en la versión 2

- **Perfiles de cálculo:** *Consigna* (valores de esta documentación, por defecto) y *Evento real* (hielo `1 g ≈ 1 ml`, `+8%` de colchón en botellas y `15 ml` libres en el borde del vaso). Cada valor es editable.
- **Tragos por invitado sugeridos:** `2` la primera hora + `1` por hora siguiente, × factor de público (`0.8` / `1.0` / `1.3`). Es solo una guía; el valor final lo decide el usuario.
- **Graduación alcohólica final aproximada:** $\text{ABV} = \dfrac{\sum (\text{ml} \times \%\text{alcohol})}{\text{líquido total} \times 1.10}$ (≈10% de dilución).
- **Presupuesto:** el margen puede aplicarse sobre el costo (*markup*: $P = C(1+m)$) o sobre la venta (*margen real*: $P = C/(1-m)$, tope 90%); admite *otros costos* (personal, traslado) e *IVA*. La cotización al cliente nunca muestra costos internos.
- **Otros:** recetas Aperol Spritz y Negroni, graduación por ingrediente, validación de entradas, impresión/PDF (`Ctrl+P`) del resumen.

> Los valores por defecto de consumo, hielo y precios son referencias editables, no datos de mercado: conviene ajustarlos a cada evento.

### F. Novedades de la versión 3

- **Varios eventos:** lista de eventos (crear, duplicar, eliminar, renombrar) con nombre, cliente y fecha; máximo 50. Tabla para **comparar** eventos (costo, precio final, precio por invitado, margen real).
- **Respaldo en JSON:** exportar todos los eventos e importar un respaldo (suma los eventos sin pisar los existentes).
- **Plantillas de evento:** Boda, Cumpleaños, Corporativo y Fiesta joven cargan invitados, duración, tipo de vaso, merma, bolsas de conservadora y margen. Todo se puede editar después.
- **Personal sugerido (referencia):** $\text{bartenders} = \lceil \text{invitados}/50 \rceil$, ayudantes $= \lceil \text{bartenders}/2 \rceil$ (si hay 2 o más bartenders) y estaciones $= \lceil \text{invitados}/100 \rceil$. Con un pago por hora, suma al costo: $\text{personas} \times \text{horas} \times \text{pago}$ (por defecto 0).
- **Cotización al cliente:** incluye nombre, cliente y fecha del evento, seña opcional ($\text{seña} = \text{precio final} \times \%$) y validez del presupuesto en días.
- **Recetas nuevas:** Mojito, Margarita, Caipirinha y Old Fashioned. Cada porción muestra su equivalente en oz y cl.
- **Nombres de vasos como en la barra:** cada vaso usa su nombre de bartender (Rocks glass, Highball, Pint glass, Copa balón) con otros nombres entre paréntesis. Un ícono "i" chico abre todos los nombres, para qué se usa y con qué no confundirlo (por ejemplo, Highball vs. Collins).

### G. El Canchero (nivel avanzado)

La calculadora tiene dos niveles. **Principiante** (pantalla de inicio) calcula **un solo cóctel por evento**, con todas las reglas de las secciones A a F. **El Canchero** arma una **carta mixta** con varios ítems, pensada para aprender cómo se resuelve un evento real. Cada evento es de un nivel, que se elige al crearlo; la lista de eventos muestra 🎩 en los Canchero. Los dos niveles comparten evento, hielo (merma y bolsas), cristalería, ajustes avanzados y presupuesto.

**Carta del evento.** Cada ítem es un *cóctel* (con su receta), *cerveza*, *vino* o *sin alcohol*, con su vaso (o *sin vaso* para latas y botellas), sus gramos de hielo y su porcentaje de consumo. Valores iniciales de referencia: cerveza en lata `473 ml`, vino `150 ml` por copa de una botella de `750 ml`, sin alcohol `300 ml` de una botella de `1500 ml`.

1. **Total de tragos:** $T = \lceil \text{invitados} \times \text{tragos por invitado} \rceil$ (igual que Principiante).
2. **Tragos de cada ítem:** $T_i = T \times \dfrac{\text{share}_i}{\sum \text{share}}$. Si la carta no suma 100%, se reparte proporcionalmente y se avisa; si suma 0%, no hay consumo (tampoco se cobran servilletas ni sorbetes).
3. **Compras unidas:** los ingredientes se agrupan por nombre (sin mayúsculas ni espacios sobrantes) **y** tamaño de envase. Se suman los ml de todos los ítems y se redondea una sola vez: $\left\lceil \dfrac{\sum \text{ml} \times (1 + \text{colchón})}{\text{envase}} \right\rceil$. El resumen muestra cuánto aporta cada ítem. Si el mismo ingrediente tiene **precios distintos** en dos ítems, se usa el más alto (criterio prudente) y se muestra un aviso.
4. **Auto-completar vaso** por ítem, con la capacidad y el hielo de su propio vaso (múltiplos de `5 ml` hacia abajo). Sin vaso, el ingrediente usa su porción fija.
5. **Hielo de servicio:** $\sum \dfrac{T_i \times \text{g}_i}{1000} \times \text{merma}$ (la cerveza en lata lleva `0 g`; un ítem *sin vaso* nunca suma hielo de servicio). La conservadora sigue siendo manual; se muestra una **sugerencia** de referencia de `0,5 kg` de hielo por litro de cerveza, vino y bebida sin alcohol.
6. **Vasos por tipo:** cristalería $\lceil \text{invitados} \times \text{rotación} \times (1+\text{rotura}) \times \text{share}_{vaso}/\sum\text{share} \rceil$ por cada tipo; descartables $\lceil T \times (\text{uso} + \text{reposición}) \times \text{share}_{con\ vaso}/\sum\text{share} \rceil$, en packs. Los ítems *sin vaso* no cuentan.
7. **Cítricos** agrupados por fruta, con las rodajas por fruta y el peso unitario de la tabla de referencia. **Costo por porción** de cada ítem: $\sum \dfrac{\text{porción}}{\text{envase}} \times \text{precio}$ (solo ingredientes).
8. **Presupuesto, personal, IVA, seña y validez:** misma lógica que Principiante.

**Datos:** cada evento guarda `level` (`principiante` o `canchero`) y, en el Canchero, `menu`. Los eventos y respaldos anteriores, sin esos campos, se abren como Principiante. Cada sección tiene una nota desplegable **"¿Por qué?"** que explica la lógica, y los valores por defecto son referencias editables, no datos de mercado.

### H. Catálogo de inspiración y menú para la barra

**Pestaña 📖 Inspiración.** Reúne **96 recetas** pensadas para quien empieza. Cada una muestra base, estilo, dificultad (fácil, media, difícil), ingredientes con medidas en ml, vaso, método, guarnición y una etiqueta con el **origen de la medida**: *Oficial IBA* (ficha de la International Bartenders Association), *Marca o medio* (receta publicada por una marca o un medio), *Proporción popular* (uso habitual, como el Fernet con Coca 30/70) o *Estimada* (adaptación propia). Los métodos y las notas están escritos con palabras propias; las medidas son datos de cada fuente. La investigación completa, con sus enlaces y lo que no se pudo verificar, está en `docs/investigacion-cocteles-argentina.md`.

- **Filtros:** búsqueda por nombre o ingrediente (sin importar tildes ni mayúsculas), base, dificultad y "solo imprescindibles" (prioridad 1).
- **Mi bar:** se marcan las botellas que se tienen (hay un "Kit base" de 13, que incluye la Angostura) y el filtro *Solo lo que puedo preparar* deja las recetas cuyas botellas están todas marcadas; los jugos, mixers y almíbares no cuentan como botella. Se guarda en este navegador.
- **Insumos difíciles de conseguir** (Chartreuse, marrasquino, pisco, mezcal, ginger beer, etc.): se avisan con un reemplazo sugerido. Es criterio general, **sin verificación en el mercado argentino**.
- **Usar en Principiante** crea un **evento Principiante nuevo** con el nombre de la receta (no pisa los datos ni los precios de otro evento) y carga la receta, el vaso y el hielo; **Agregar a mi carta** la suma a la carta del Canchero con 0% si la carta ya suma 100% (el menú avisa cuántos ítems quedan afuera por tener 0%). Los ingredientes sin medida en ml (menta, azúcar, bitter) no se compran ni se cobran. El precio y el envase de cada ingrediente son valores de referencia por categoría, editables, no datos de mercado.
- **Vasos:** los que no existen en la calculadora (copa de cóctel, flauta) se cargan como *Rocks glass* sin hielo en el vaso; el hielo de la coctelera no se cuenta.

**Menú para la barra (PDF).** El botón *Menú para la barra* abre una hoja para imprimir o *Guardar como PDF* con el nombre de cada trago y sus **ingredientes, sin precios ni cantidades** (los invitados no tienen por qué verlos). En Principiante muestra la receta del evento; en El Canchero, los ítems con más de 0%. Las cervezas, vinos y bebidas sin alcohol van solo con su nombre. Funciona sin conexión y sin librerías: el navegador genera el PDF desde su cuadro de impresión.

### I. Horarios, personal y opciones "Otros"

**Horarios del evento.** En *Mis eventos* se cargan la **hora de llegada** y la **hora de finalización** (si termina "antes" de llegar, el evento cruza la medianoche). El cronograma se arma solo, con 1 hora de armado y 1 hora de retiro y limpieza por defecto (editables, de 0 a 6 h):

$$\text{atención} = (\text{fin} - \text{llegada}) - \text{armado} - \text{retiro y limpieza}$$

Por ejemplo, llegada 19:00 y fin 03:00: armado 19:00 a 20:00, **atención 20:00 a 02:00 (6 h)** y retiro y limpieza 02:00 a 03:00. Las horas de atención reemplazan a la duración manual de la barra (que se bloquea) y alimentan la estimación de tragos por invitado. El armado y el retiro **quedan incluidos en el servicio** y se aclaran al cliente en el presupuesto y en la lista interna.

El cronograma solo vale si quedan **al menos 1 hora de atención**. Si no (por ejemplo, llegada y fin a la misma hora, o un armado y retiro más largos que el evento), la pantalla muestra una advertencia y el cálculo y los textos lo **ignoran**: se usan las horas de la barra cargadas a mano.

**Personal y ganancia por hora.** Las *personas que trabajan* se sugieren solas (1 bartender cada 50 invitados, más ayudantes) o se escriben a mano. El *pago por hora* es lo que se le paga a **cada** persona:

$$\text{costo del personal} = \text{personas} \times \text{horas de trabajo} \times \text{pago por hora}$$

Con horarios, las horas de trabajo son **todas** (armado + atención + retiro y limpieza); sin horarios, solo las horas de la barra. La ganancia neta se divide por las horas de atención y por las horas totales para mostrar la **ganancia aproximada por hora**.

**Opciones "Otros".** En *Evento y Receta Rápida*, **➕ Otros** permite nombrar una bebida propia y **guardarla** con ese nombre (vaso, ingredientes y hielo): aparece como pastilla en los próximos eventos. En *Cítricos y bitter / dashes*, **Otros** sirve para un bitter, dashes u otra guarnición propia: se carga la cantidad por trago, cuántos usos rinde el envase y su precio, y se compran envases enteros $\lceil \text{usos totales} / \text{usos por envase} \rceil$. También se puede guardar para futuros eventos (la bebida guardada conserva el bitter con sus usos, rendimiento y precio). Todo se guarda en este navegador.

**Plantillas con horarios.** Si el evento ya tiene un cronograma válido, la plantilla **no** cambia las horas de atención: se mantienen las del cronograma y los tragos por invitado se estiman con ellas. Las horas de atención se usan **exactas** (por ejemplo 2,75 h), tanto en pantalla como en el presupuesto. Si se escribe a mano una cantidad de personas con decimales, se redondea y nunca baja de 1.

**Bitter propio en la carta del Canchero.** Cada trago de la carta puede usar *Otros* en el campo *Cítrico, bitter o dashes*: se carga el nombre, la cantidad por trago, cuántos usos rinde el envase y su precio. Los tragos que usan el mismo nombre se agrupan y se compran envases enteros.

**Ajustes avanzados.** Son opcionales y solo existen en El Canchero: hay que tildar *Quiero usar ajustes avanzados*; al destildar se vuelve a los valores de la documentación. **Principiante siempre usa los valores de la documentación** (también en eventos guardados antes con otro perfil). El *colchón de botellas* es un porcentaje extra de botellas para derrames y cortesías (con 8%, 100 botellas pasan a 108). El campo *Alcohol de la botella (% vol)* es el de la etiqueta de cada botella, no el del vaso.

## 3. Persistencia y Exportación (WhatsApp)

- **Guardado Automático (`localStorage`):** Cada cambio en cantidades, recetas o precios de referencia se almacena automáticamente bajo la clave `bar_manager_pro_events_v3` (la v3 guarda la lista de eventos; si existe un guardado anterior en `bar_manager_pro_state_v2`, se migra solo como "Evento 1"). El botón **"Restaurar valores por defecto"** (pide confirmación) limpia la memoria local y reinicia la plantilla. Los datos guardados se validan al cargarlos, por lo que un estado corrupto no rompe la página.
- **Lista de Compras (Interna):** Genera un mensaje estructurado para el equipo de compras/barra con cantidades exactas de botellas, bolsas de hielo (desglosando servicio y conservadora), kilos de fruta, packs de insumos y costos internos.
- **Presupuesto para Cliente:** Genera una cotización comercial limpia que oculta los costos unitarios internos y presenta el servicio incluido, cobertura de tragos, inversión total (con el margen de ganancia aplicado) y costo por invitado.