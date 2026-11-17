# El Canchero — diseño

Fecha: 2026-11-17. Estado: aprobado por el dueño del proyecto en la conversación ("si" a la recomendación).

## Intención y por qué

Bar Manager Pro hoy calcula **un solo cóctel por evento** (nivel *Principiante*). Un evento real mezcla varios tragos, cerveza, vino y bebida sin alcohol. El dueño quiere una sección aparte, **El Canchero**, que resuelva eso sin volver pesada la pantalla de inicio. Es un laboratorio educativo para un curso de bartender: no se cobra, y la idea es que quien lo use **aprenda la lógica**, no solo vea el resultado.

## Metas

- Principiante queda **igual** (misma pantalla de inicio, mismos resultados).
- El Canchero permite una **carta mixta** de varios ítems con su porcentaje de consumo.
- Los ingredientes repetidos entre tragos se **unen en una sola compra**.
- Cada cálculo tiene una nota **"¿Por qué?"** que explica la lógica.
- Un solo `index.html`, sin dependencias (consigna del curso).

## No metas / anti-metas

- No cobrar ni tener cuentas, nube o backend.
- No romper eventos ya guardados ni la migración v2→v3.
- No mezclar los dos niveles dentro de un mismo evento (confunde los cálculos).
- Anti-meta: que Principiante se vuelva más complejo o lento de usar.

## Enfoque elegido

Cada **evento tiene un nivel** (`principiante` o `canchero`), que se elige al crearlo. La lista de eventos es una sola y muestra una etiqueta 🎩 en los Canchero. Dos pestañas arriba (🍸 Principiante / 🎩 El Canchero) llevan al evento más reciente de ese nivel, o crean uno si no existe.

Alternativas descartadas: una lista de eventos separada por nivel (duplica pantallas y el respaldo JSON) y permitir ambos modos dentro de un mismo evento (los cálculos se contradicen).

## Qué cambia en la pantalla

- La tarjeta **Mis eventos** pasa a ser de ancho completo sobre las dos vistas, con botones "+ Nuevo" y "+ Nuevo Canchero".
- La columna derecha (resumen y presupuesto) es **compartida**: en Canchero muestra la lista de compras unida.
- Columna izquierda en Canchero: *Evento* (invitados, tragos por invitado, horas, público), **Carta del evento**, hielo (parámetros), cristalería/descartables, ajustes avanzados y las notas "¿Por qué?". Se ocultan: recetas rápidas, tipo de vaso único, ingredientes únicos y cítricos únicos.

## Carta del evento (modelo)

Cada ítem: `{ id, kind, name, sharePct, glassId, ingredients[], iceGrams, fruitType, slicesPerDrink }`.

- `kind`: `cocktail` (receta con varios ingredientes), `beer`, `wine`, `soft` (un solo ingrediente con porción y envase).
- `glassId` admite `none` (lata o botella: sin vaso).
- Si la carta no suma 100%, se reparte **proporcionalmente** y se avisa.

## Reglas de cálculo (Canchero)

1. Total de tragos $T = \lceil \text{invitados} \times \text{tragos por invitado} \rceil$ (igual que Principiante).
2. Tragos del ítem $i$: $T \times \text{share}_i / \sum \text{share}$.
3. **Compras unidas:** se agrupan ingredientes por nombre (sin mayúsculas ni espacios sobrantes) y tamaño de envase; se suman los ml de todos los ítems y se aplica una sola vez $\lceil \text{ml} / \text{envase} \rceil$ (con colchón de botellas del perfil). El resumen muestra cuánto aporta cada ítem.
4. **Auto-completar vaso** por ítem, con la capacidad e hielo de su propio vaso (misma regla de la documentación: múltiplos de 5 ml hacia abajo).
5. **Hielo de servicio** $= \sum (\text{tragos}_i \times \text{g}_i)/1000 \times \text{merma}$. La conservadora sigue siendo manual, con una **sugerencia** mostrada como referencia.
6. **Vasos por tipo:** cristalería $\lceil \text{invitados} \times \text{rotación} \times (1+\text{rotura}) \times \text{peso del vaso} \rceil$ por cada tipo; descartables por tragos, redondeados a packs sobre el total. Los ítems sin vaso no cuentan.
7. **Cítricos** agrupados por fruta; **costo por porción** de cada ítem como dato educativo.
8. Personal, extras, margen, IVA, seña y validez: **misma lógica** que Principiante (función de presupuesto compartida).

## Datos y compatibilidad

- `event.level` nuevo (por defecto `principiante`); `state.menu` nuevo (por defecto vacío). Los datos viejos se leen sin cambios y el guardado sigue en `bar_manager_pro_events_v3`.
- El respaldo JSON incluye el nivel. Un respaldo anterior sin nivel se importa como Principiante.

## Aprendizaje

Cada sección de El Canchero tiene un bloque desplegable **"💡 ¿Por qué?"** (por ejemplo, por qué se unen las compras, por qué el hielo depende del vaso, por qué la carta se normaliza a 100%). Los valores por defecto son referencias editables, no datos de mercado.

## Lo que queda para quien construye

- Valores iniciales de la carta de ejemplo y de cerveza/vino/sin alcohol (porción y envase).
- Texto exacto de las notas "¿Por qué?".
- Distribución visual de la tarjeta de cada ítem de la carta.
