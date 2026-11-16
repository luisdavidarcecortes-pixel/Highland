# Publicar la web (Vercel, plan gratuito)

Guía paso a paso. Tarda unos 30 minutos la primera vez.

---

## 1. Qué hay que tener listo

- La **base de datos de Supabase** con el esquema aplicado y las **cuatro
  migraciones** (`supabase/SETUP.md` §2.1 y §2.2). Si falta la última
  (`20261111000400_storage_manifest_type.sql`), la web funciona igual, pero
  cada instancia vuelve a preparar el PDF en vez de reutilizar las páginas ya
  guardadas.
- Una **cuenta de Vercel** (gratis: https://vercel.com).
- El repositorio de GitHub: `github.com/luisdavidarcecortes-pixel/Highlander`.

## 2. Subir el código

El repositorio ya está conectado. Cada `git push` a la rama desplegada
redespliega la web automáticamente.

```bash
git add -A
git commit -m "Rediseño editorial, autorización por contenido y lector preparado"
git push origin release-v1
```

## 3. Crear el proyecto en Vercel

1. Entra en https://vercel.com → **Add New… → Project**.
2. Elige **Import** el repositorio `luisdavidarcecortes-pixel/Highlander`.
3. Vercel detecta Next.js solo: no hay que cambiar nada del *Framework
   Preset* ni del *Build Command*.
4. Pulsa **Deploy**.

## 4. Variables de entorno

En **Project → Settings → Environment Variables**, añade estas cinco (para
*Production*, *Preview* y *Development*):

| Variable | Dónde está el valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → la clave *publishable* / *anon* |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → la clave *secret* / *service_role* (solo servidor, nunca `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SITE_URL` | La URL pública del proyecto, p. ej. `https://highlander.vercel.app` |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (gratis; sin ella, el análisis del PDF usa la heurística local) |

> `NEXT_PUBLIC_SITE_URL` es **obligatoria** en producción: sin ella la web no
> arranca (es lo que evita publicar enlaces canónicos con `localhost`).

Pulsa **Deploy** otra vez para que las variables se apliquen.

## 5. Avisar a Supabase de la nueva URL

Esto se olvida siempre y hace que los correos de invitación y de
restablecimiento de contraseña no vuelvan a la web:

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: `https://tu-dominio.vercel.app`.
3. **Redirect URLs**: añade
   - `https://tu-dominio.vercel.app/auth/confirm`
   - `http://localhost:3000/auth/confirm` (para seguir probando en local)

Si más tarde usas un dominio propio, repite este paso con el dominio nuevo.

## 6. Comprobar que todo funciona

```bash
npm run supabase:check
```

El script habla con **Supabase**, no con Vercel: te dice si las claves, las
tablas, el bucket privado y las migraciones están en su sitio.

Después, en el navegador:

| Ruta | Qué comprobar |
|---|---|
| `/` | La portada, con el titular animado |
| `/archive` | Las portadas de los números |
| `/read` | El lector: la primera apertura tarda (prepara el PDF), las siguientes van rápidas |
| `/admin/login` | Entrar con la cuenta de administrador |

## 7. Dominio propio (opcional)

Vercel → **Project → Settings → Domains** → añade el dominio y sigue las
indicaciones de DNS. Después:

1. Actualiza `NEXT_PUBLIC_SITE_URL` con el dominio nuevo y redespliega.
2. En Supabase → *Authentication → URL Configuration*, añade
   `https://tu-dominio/auth/confirm` a **Redirect URLs** y cambia el
   **Site URL**.

---

## Notas del plan gratuito

- **Límite de las funciones**: en Hobby cada función dura hasta 5 minutos. El
  lector prepara el número dentro de ese margen; si un número fuera enorme, la
  primera visita podría quedarse a medias, pero las páginas ya renderizadas se
  guardan en Supabase Storage y la siguiente visita continúa (y la propia
  página reintenta en cuanto ve que no hay progreso).
- **Caché del lector**: se guarda en `/tmp` de cada función (el disco de la
  instalación no se puede escribir). La copia buena está en Supabase Storage,
  así que da igual en qué función caiga cada visita.
- **PDFs de demo**: los dos PDF de ejemplo (42 MB cada uno) no se suben al
  despliegue (`.vercelignore`) ni viajan dentro de la función del lector
  (`outputFileTracingExcludes`); solo se usan en local.
- **Ancho de banda**: 100 GB/mes en Hobby. Las páginas del lector son la
  parte más pesada: por eso se guardan en Storage y se sirven como WebP.
- **Supabase gratis**: 500 MB de base de datos y 1 GB de Storage. Cada número
  preparado ocupa unos 3 MB en Storage.
