# Bar Manager Pro en Android y Google Play

La app tiene tres formas de usarse. Las tres funcionan **sin internet** y guardan los datos solo en el dispositivo.

| Forma | Para quién | Cómo |
|---|---|---|
| **Web / PC** | Cualquiera | Abrir `index.html` o la página publicada |
| **App instalable (PWA)** | Celular, tablet y PC | En Chrome o Edge: botón "Instalar" de la pantalla de inicio. En iPhone: Compartir → Añadir a pantalla de inicio |
| **APK Android** | Celulares y tablets Android | Se compila en GitHub (abajo) |

## Obtener el APK

1. Entrá a <https://github.com/ThePantera/CalculadoraBar/actions> → **Android APK** → **Run workflow**.
2. Esperá unos 8 a 12 minutos. Si algo falla en las pruebas o en la compilación, no se genera el APK.
3. Al terminar, abrí la ejecución y bajá **BarManagerPro-debug-apk** (es un .zip con `app-debug.apk`).
4. Pasalo al celular, abrilo y aceptá "instalar apps de orígenes desconocidos" cuando Android lo pida.

El APK de prueba está firmado con una clave de depuración: sirve para instalar y probar, **no para Google Play**.

## Qué trae la versión Android

- La misma app, con todos los archivos adentro (no necesita conexión ni dominio).
- **Sin permisos para el usuario**: se le quita el permiso de internet al compilar y no pide cámara, ubicación, contactos ni archivos.
- Íconos propios.
- "Exportar respaldo" abre el menú de compartir de Android (el navegador no puede descargar archivos dentro de la app).
- Usa Capacitor (licencia MIT) y el WebView del sistema.

## Para subirla a Google Play (cuando quieras)

Hacen falta cosas que son tuyas y no se pueden automatizar:

1. **Cuenta de desarrollador de Google Play** (pago único de USD 25). Las cuentas personales nuevas suelen tener que hacer una **prueba cerrada con varios testers durante unas dos semanas** antes de publicar; verificá el requisito vigente en la Play Console.
2. **Clave de firma propia (upload key).** Se genera una sola vez con `keytool` (viene con Java) y **se guarda en lugar seguro: si se pierde, no se puede actualizar la app**. Después se cargan 4 secretos en GitHub (Settings → Secrets and variables → Actions):
   `ANDROID_KEYSTORE_B64` (la clave en base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   Con eso el mismo flujo genera también el **AAB firmado** (`BarManagerPro-release`) que pide Google Play. Esta parte aún no se probó de punta a punta.
3. **Identificador de la app (`appId`)**: hoy es `com.barmanagerpro.app` (en `android-app/capacitor.config.json`). **No se puede cambiar una vez publicada**: confirmalo antes de la primera subida.
4. **Fichas de la tienda:** nombre, descripción corta y larga, ícono 512×512 (`icons/icon-512.png`), gráfico de funciones 1024×500 y capturas de pantalla de celular (y tablet si querés aparecer bien en tablets).

### Respuestas para los formularios de Play Console

| Formulario | Respuesta sugerida |
|---|---|
| **URL de política de privacidad** | `https://thepantera.github.io/CalculadoraBar/legal.html#privacidad` |
| **Seguridad de los datos** | No recopila ni comparte datos. Sin cuentas, sin analítica, sin anuncios. Datos solo en el dispositivo. |
| **Anuncios** | No contiene anuncios |
| **Acceso a la app** | Todo está disponible sin cuenta ni contraseña |
| **Público objetivo** | Solo mayores de 18 años (la app trata sobre bebidas alcohólicas) |
| **Clasificación de contenido** | Declarar referencias a alcohol (es un calculador, no vende ni promueve consumo) |
| **Categoría** | Negocios o Comida y bebida |
| **Permisos** | Ninguno que el usuario deba aceptar (sin internet) |

### Puntos de política a revisar antes de publicar

- **Donaciones:** la pantalla de inicio muestra un alias para donar. Las políticas de Google Play sobre pagos y donaciones cambian y son estrictas con pedidos de dinero dentro de apps. Leé la política vigente de "Payments" antes de subir. Si hay dudas, la salida más segura es **quitar el texto de donación de la versión de Play** y dejarlo solo en la web y el APK directo.
- **Alcohol:** Google Play restringe apps que *venden o facilitan la venta* de alcohol. Esta app solo calcula cantidades y presupuestos; conviene decirlo claro en la descripción ("no vende ni entrega bebidas").
- **Marcas:** la app nombra marcas (Campari, Aperol, Fernet, etc.) solo para identificar productos de una receta. Evitá usar logos o nombres de marcas en el título, el ícono o las capturas de la tienda.
- **Cuenta de comerciante / datos de contacto** de la ficha: Play muestra un correo de contacto público del desarrollador.

## Mantenimiento

- Para forzar que todos los dispositivos bajen una versión nueva de la PWA, subí `VERSION` en `sw.js`.
- Cada ejecución del flujo sube automáticamente el `versionCode` de Android.
