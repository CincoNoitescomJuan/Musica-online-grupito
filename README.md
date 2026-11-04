[README.md](https://github.com/user-attachments/files/34380043/README.md)

# ROLEPLAY MUSIC 3.1 — corrección de salas y rediseño visual

## Qué cambia
- Corregido el heartbeat de las salas: ya no envía una orden de pausa. El anfitrión actualiza la posición manteniendo `is_playing = true`.
- Solo el creador de la sala envía el heartbeat periódico, evitando que cada participante compita por actualizar el estado.
- Rediseño visual de la página de salas, reproductor, tarjetas, campañas y formularios.
- Añadidos estilos para las portadas de la canción actual y de cada fila de la lista de reproducción.
- Mejor espaciado, tarjetas más amplias y ajustes para móvil.

## Nota sobre portadas
Las portadas existentes se mostrarán si la canción o campaña tiene una imagen subida y almacenada en el bucket privado `roleplay-covers`. Las canciones que se subieron sin imagen seguirán mostrando la portada genérica hasta que se editen o se vuelvan a subir con portada.

No se requiere ninguna migración adicional de Supabase para esta versión.
