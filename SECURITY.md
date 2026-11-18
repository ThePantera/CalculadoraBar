# Política de seguridad

## Cómo se protege la app

- **Sin red:** la app no hace pedidos a internet ni carga recursos externos. La política de seguridad de contenido (CSP) lo impide (`connect-src 'none'`).
- **Sin datos en servidores:** todo se guarda en el almacenamiento local del dispositivo.
- **Textos escapados:** todo texto que carga el usuario (nombres de eventos, clientes, ingredientes) se escapa antes de mostrarse.
- **Importación segura:** los respaldos JSON se limpian y validan campo por campo (tipos, rangos, cantidades máximas), por lo que un archivo dañado o malicioso no rompe la app.
- **Android:** la app no pide permiso de internet ni ningún otro permiso.

## Reportar una vulnerabilidad

Usá el aviso privado de GitHub: <https://github.com/ThePantera/CalculadoraBar/security/advisories/new>.
Por favor no publiques los detalles hasta que esté corregido.

## Versiones con soporte

Solo la última versión publicada en la rama `main`.
