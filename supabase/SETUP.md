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
- El bucket privado `newspaper`; los enlaces públicos de la web se autorizan según la publicación del contenido.
- El trigger que crea un perfil solamente al invitar a un miembro.

> Si el SQL se corta o falla a mitad, **no se aplica nada**: el archivo entero
> corre en una sola transacción. Vuelve a ejecutarlo completo y listo.

### 2.1 Aplicar la migración de ownership (obligatorio)

Después de `schema.sql` y `harden-newspaper.sql`, aplica **una vez** la
migración que restringe la edición de contenido a su autor:

1. **SQL Editor → New query**.
2. Abre `supabase/migrations/20261111000100_content_ownership.sql`, copia todo
   el contenido y pégalo.
3. Pulsa **Run**.

Qué cambia:

- Un **artículo** solo puede editarlo quien lo escribió (o un administrador).
- Un **número** solo puede editarlo o publicarlo quien lo subió (o un
  administrador).
- Publicar y despublicar cuentan como editar: nadie publica el trabajo de otro.

Sin esta migración, la base de datos mantiene la versión antigua (cualquier
miembro activo podía cambiar cualquier fila). La API ya lo bloquea, pero sin
esta migración la base de datos queda menos protegida. El archivo es
idempotente: aplicarlo dos veces no rompe nada.

### 2.2 Aplicar las migraciones de límites (obligatorio)

Después de la 2.1, aplica estas tres, **en este orden**:

1. `supabase/migrations/20261111000200_reader_jobs.sql`
2. `supabase/migrations/20261111000300_ai_global_quota.sql`
3. `supabase/migrations/20261111000400_storage_manifest_type.sql`

Qué cambian:

- **Cola global del lector**: las páginas del número se preparan una sola vez
  para todo el sitio (se guardan en Storage) y hay un límite de 4 preparaciones
  simultáneas y 3 por minuto y visitante. Sin esto, cada instancia repetía el
  render del PDF y un visitante podía saturar la cola.
- **Tope global de IA**: además del límite por miembro, hay un límite para todo
  el sitio, para que una sola cuenta no gaste todo el crédito de Gemini.
- **Tipos del bucket**: permite guardar el índice de las páginas del número
  (`application/json`) junto a los PDF y las imágenes.

Las tres son idempotentes: aplicarlas dos veces no rompe nada.

### Comprobar que todo está en su sitio

En cualquier momento puedes ejecutar:

```
npm run supabase:check
```

El script comprueba que las claves funcionan, que las tablas y el bucket
privado existen **y que las tres migraciones están aplicadas** (tablas nuevas,
funciones de la cola del lector y de la cuota de IA, que los borradores no
sean visibles para el público y que un editor no pueda modificar el
contenido de otro). Si algo falta, dice qué migración volver a aplicar.

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
up"**. Las cuentas las crea un administrador desde el panel; la base de datos también impide que un registro público reciba permisos editoriales.

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
2. Las cuentas creadas manualmente no reciben perfil automático. Cree su perfil de administrador en el **SQL Editor**:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Administrador', 'admin' from auth.users
where email = 'profesor@colegio.edu'
on conflict (id) do update set role = 'admin';
```

3. Entra en `/admin` con ese correo y contraseña.

A partir de ahí, ese admin puede invitar al resto del equipo desde
**/admin/team** (requiere `SUPABASE_SERVICE_ROLE_KEY`).

Antes de invitar o cambiar permisos, abre **/admin/account → Two-factor authentication**,
configura una app autenticadora y verifica el código. Las operaciones de equipo
exigen una sesión `aal2` tanto en la API como en SQL. Si pierdes el autenticador,
la recuperación debe hacerla el propietario del proyecto desde Supabase Auth.

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

## Actualizar un proyecto existente

Ejecute `supabase/harden-newspaper.sql` en SQL Editor después de actualizar la web. Es idempotente y conserva las publicaciones y cuentas. Sin esta migración, las nuevas subidas y las cuotas de IA se rechazan de forma segura. No es necesario pegar claves en el chat.

La versión actual añade `profiles.active`, historial editorial, sincronización
del correo verificado, permisos por autor y MFA para gestionar el equipo.
**Deactivate access** revoca los permisos sin borrar Auth, archivos ni autoría;
**Restore access** permite revertir la baja. No se debe borrar una cuenta de Auth
para dar una baja ordinaria. El historial empieza a registrar al aplicar la
migración; no reconstruye cambios anteriores. La lista del equipo distingue
cuentas invitadas, activas e inactivas. El vencimiento del enlace se configura
en Supabase y no se estima desde la fecha de invitación.

Para navegar localmente sin la compilación de la primera visita, use `npm run preview`. Para trabajar en el código con recarga automática, use `npm run dev` (Turbopack).
