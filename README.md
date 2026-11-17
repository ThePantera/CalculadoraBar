# Bar Manager Pro

Calculadora web para bartenders y servicios de barra móvil: calcula cuántas botellas pedir, el hielo, los vasos, las guarniciones, el personal sugerido y el presupuesto de un evento, con cotización lista para enviar por WhatsApp.

## Uso

Abrí `index.html` en el navegador. No necesita instalación ni conexión a internet. Los datos se guardan solos en el navegador.

## Qué hace

- **Cálculo de insumos:** botellas y mixers, hielo (servicio + conservadora), cítricos, cristalería o vasos descartables, servilletas y sorbetes.
- **Recetas rápidas:** Gin Tonic, Fernet con Coca, Campari Orange, Cuba Libre, Vodka Tonic, Aperol Spritz, Negroni, Mojito, Margarita, Caipirinha y Old Fashioned, con medidas en ml, oz y cl y graduación alcohólica final aproximada.
- **Varios eventos:** crear, duplicar y eliminar eventos (nombre, cliente y fecha), compararlos en una tabla y guardar un respaldo en JSON.
- **Plantillas:** Boda, Cumpleaños, Corporativo y Fiesta joven.
- **Presupuesto:** margen sobre el costo o sobre la venta, otros costos, personal, IVA, seña y validez.
- **Exportación:** lista de compras interna y presupuesto para el cliente (WhatsApp), e impresión/PDF del resumen.

## Contenido

| Archivo | Descripción |
|---|---|
| `index.html` | La aplicación completa (HTML + CSS + JS) |
| `Documentacion.md` | Fórmulas y reglas de negocio |
| `tests/calc.test.js` | Pruebas del motor de cálculo |

## Pruebas

Requieren [Node.js](https://nodejs.org) 18 o superior:

```
node --test tests/
```

## Aviso

Los valores por defecto (consumo, gramos de hielo, personal, precios) son referencias editables, no datos de mercado. Ajustalos a cada evento.
