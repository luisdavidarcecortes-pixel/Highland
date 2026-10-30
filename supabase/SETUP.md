# Configurar Supabase (salir de modo demo)

La web arranca en **modo demo** mientras `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` no estén definidas en `.env.local`. En modo demo
se ve contenido de ejemplo y el panel no guarda nada.

Tiempo estimado: **10–15 minutos**. Todo cabe en el plan gratuito.

## 1. Crear el proyecto

1. Entra en https://supabase.com/dashboard y crea una cuenta si no tienes.
2. **New project**:
   - Nombre: `highlander-newspaper` (o el que quieras).
   - Región: la más cercana (por ejemplo `East US`).
   - Database password: genera una y **guárdala**; no la necesitas para la web,
     pero sí para administrar la base de datos.
3. Espera a que termine de aprovisionarse (1–2 minutos).

## 2. Crear las tablas y el bucket

1. En el panel del proyecto: **SQL Editor → New query**.
2. Abre `supabase/schema.sql`, copia **todo** el contenido y pégalo.
3. Pulsa **Run**.

Eso crea:

- `profiles`, `editions` y `articles` con sus políticas RLS.
- Las funciones `is_admin()`, `is_editor()` y `my_role()`.
- El bucket público `newspaper` con las políticas de Storage.
- El trigger que crea un perfil al registrar un usuario.

> Si el SQL se corta o falla a mitad, vuelve a ejecutarlo completo: es
> idempotente (`create table if not exists`, `drop policy if exists`).

## 3. Copiar las claves

En **Project Settings → API Keys**:

| En la web | Variable de `.env.local` |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) o **anon public** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_…`) o **service_role** | `SUPABASE_SERVICE_ROLE_KEY` |

- La clave **publishable/anon** es pública: puede ir en el navegador.
- La clave **secret/service_role** es privada: solo servidor. **Nunca** la pongas
  en una variable `NEXT_PUBLIC_*` ni la subas a Git.

## 4. Configurar la autenticación

En **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` (en producción, la URL de Vercel).
- **Redirect URLs**: añade `http://localhost:3000/auth/confirm` y el equivalente
  de producción (`https://tu-web.vercel.app/auth/confirm`). Sin esto, las
  invitaciones y los correos de restablecimiento de contraseña no vuelven a la web.

En **Authentication → Providers → Email**, desactiva **"Allow new users to sign
up"**. Las cuentas las crea un administrador desde el panel; si el registro
público queda activo, cualquiera podría crearse una cuenta de editor.

## 5. Rellenar `.env.local`

Abre `.env.local` y deja estas líneas **sin `#`**, con tus valores:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_SECRETA

NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_API_KEY=TU_CLAVE_DE_GEMINI
```

No pongas comillas. Guarda el archivo y **reinicia** el servidor:

```bash
npm run dev
```

La web deja de mostrar el aviso de modo demo.

## 5. Comprobar que todo está bien

```bash
npm run supabase:check
```

El script comprueba, sin imprimir ninguna clave:

- que el proyecto responde;
- que la clave pública y la secreta son válidas;
- que existen las tablas `profiles`, `editions` y `articles`;
- que existe el bucket `newspaper`;
- que la API de administración está disponible.

Si algo falla, el propio script indica qué paso revisar.

## 6. Crear el primer administrador

El panel no tiene registro público: la primera cuenta se crea a mano.

1. **Authentication → Users → Add user**:
   - Email: el correo del profesor responsable.
   - Password: una contraseña segura.
   - Marca **Auto Confirm User**.
2. El trigger crea su perfil como `editor`. Elévelo a administrador en el
   **SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where email = 'profesor@colegio.edu';
```

3. Entra en `/admin` con ese correo y contraseña.

A partir de ahí, ese admin puede invitar al resto del equipo desde
**/admin/team** (requiere `SUPABASE_SERVICE_ROLE_KEY`).

## 7. Publicar el primer número

1. `/admin/editions → New issue`.
2. Selecciona el PDF; se verifican y ordenan las páginas por su número impreso,
   se genera la portada y Gemini sugiere los metadatos.
3. Revisa **Number**, **Date**, **Title**, **Description** y **School year**.
4. **Upload issue** y luego pulsa el ojo para publicarlo.

> Al salir de modo demo la web aparece vacía hasta que publiques el primer
> número: los datos de ejemplo **no** se copian a la base de datos real.

## 8. Producción (Vercel)

En **Vercel → Project → Settings → Environment Variables**, añade las mismas
variables con:

```env
NEXT_PUBLIC_SITE_URL=https://tu-web.vercel.app
```

Vuelve a desplegar. En Supabase, **Authentication → URL Configuration**, pon esa
URL como *Site URL* y añádela a *Redirect URLs*.

## Errores comunes

| Síntoma | Causa y solución |
|---|---|
| `NXDOMAIN` / no conecta | La URL es de un proyecto borrado o tiene una errata. Copia la actual en Project Settings → API. |
| `401 Invalid API key` | Clave equivocada, o mezclaste la publishable con la secret. Revisa las tres variables. |
| `relation "public.editions" does not exist` | No se ejecutó `supabase/schema.sql` completo. |
| `Bucket not found` | El bloque de Storage del schema no se ejecutó. Vuelve a correr el archivo entero. |
| `new row violates row-level security policy` | Faltan políticas; ejecuta el schema completo, no solo las tablas. |
| No llegan invitaciones | Falta `SUPABASE_SERVICE_ROLE_KEY`, o la URL de redirect no está permitida en Supabase Auth. |
| La web sigue en modo demo | El servidor no se reinició, o las variables siguen comentadas con `#`. |

## Seguridad

- `.env.local` está en `.gitignore`: no se sube al repositorio.
- La clave `service_role` salta RLS: trátala como una contraseña de
  administrador. Si se filtra, rótala en **Project Settings → API Keys**.
- No la uses nunca en componentes de cliente ni en variables `NEXT_PUBLIC_*`.
