# ROLEPLAY MUSIC — acceso sencillo sin correo

## Cómo funciona el acceso
- El visitante escribe un nombre y entra sin correo ni contraseña.
- Supabase crea una identidad anónima única para ese navegador.
- La sesión de Supabase se conserva en el almacenamiento local del navegador.
- El nombre visible se guarda en `profiles` y también se recuerda localmente.
- El usuario puede cambiar su nombre desde **Mi perfil**.
- Cambiar el nombre no cambia su identidad ni sus permisos.

## Archivos
- `index.html`, `styles.css`, `app.js`: aplicación.
- `config.js`: URL y publishable key pública.
- `supabase_setup.sql`: tablas, trigger, buckets y políticas RLS.

## Configuración de Supabase
1. En Supabase > Authentication > Providers, activa **Anonymous Sign-Ins** (proveedor Anonymous).
2. Abre SQL Editor > New query.
3. Ejecuta el contenido completo de `supabase_setup.sql`.
4. En Authentication > URL Configuration, añade la URL de GitHub Pages y `http://localhost:8000/**` como Redirect URLs si vas a probar localmente.

## Primer administrador
El primer acceso crea un usuario anónimo. Para convertir ese usuario en administrador:
1. Entra en la web desde el navegador que será el de administración.
2. En Supabase > SQL Editor ejecuta:

```sql
update public.profiles
set role = 'admin'
where id = 'PEGA_AQUI_EL_UID_DEL_USUARIO';
```

Puedes encontrar el UID en Authentication > Users. El usuario anónimo aparecerá en la lista.
La sesión de administrador queda asociada a ese navegador. Si borras los datos del navegador o cambias de dispositivo, la identidad anónima será distinta. Más adelante podemos añadir un acceso privado de administrador para recuperar el panel en varios dispositivos.

## Publicar en GitHub Pages
Sube todos los archivos del proyecto al repositorio. En Settings > Pages selecciona Deploy from a branch, rama `main` y carpeta `/(root)`.

## Seguridad y limitaciones
- La URL y la publishable key son públicas por diseño.
- Nunca publiques secret keys ni service_role.
- RLS restringe la biblioteca a usuarios autenticados (incluidos los usuarios anónimos de Supabase).
- Todos los miembros pueden leer y subir canciones.
- Solo administradores pueden editar o eliminar canciones y archivos.
- Los buckets son privados y la aplicación genera URLs firmadas de una hora.
- Las sesiones anónimas son específicas del navegador/dispositivo y no se recuperan automáticamente si se borran los datos locales.
- Para salas sincronizadas aún falta implementar el canal en tiempo real y la autoridad de reproducción.
