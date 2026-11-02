# Development Intelligence

Tablero y agente de seguimiento del equipo de Aplicaciones Digitales sobre Jira Cloud.
Next.js 16 (App Router) para desplegar en Vercel. El API token de Jira y la API key de Claude viven solo en variables de entorno del servidor; el navegador nunca los ve.

## Qué hace

- **Sincroniza Jira** con `/rest/api/3/search/jql` (paginado por `nextPageToken`, con changelog, comentarios y nombres de campos). Guarda la última sincronización en memoria `JIRA_CACHE_SECONDS` y el navegador refresca cada `NEXT_PUBLIC_REFRESH_MINUTES`. El botón **Sincronizar** fuerza una consulta nueva.
- **Vistas**: Resumen (KPIs, alertas, sprints, proyectos, flujo semanal), Equipo, Stoppers, Tareas, Despliegues (transiciones a estados DEV/QA/PRD), Comentarios y detalle de cada issue.
- **Agente**: chat con Claude que consulta los datos con herramientas (`buscar_issues`, `detalle_issue`, `metricas_equipo`, `stoppers`, `despliegues`, `comentarios`, `evolucion`) y puede ejecutar un JQL de solo lectura en vivo (`consultar_jql`). Separa hechos, inferencias y recomendaciones. No modifica Jira.
- **Acceso** con contraseña (`APP_PASSWORD`) y sesión firmada de 7 días.

## Estructura

```
app/
  api/auth/login|logout   sesión
  api/jira/sync           sincronización con Jira
  api/agent               agente (streaming NDJSON)
  login/                  pantalla de acceso
  page.tsx                tablero
components/               Dashboard, vistas, panel del agente, detalle de issue
lib/
  jira.ts                 cliente REST de Jira + caché
  analyze.ts              normalización y métricas
  agent.ts                herramientas y prompt del agente
  auth.ts, env.ts         sesión y variables
proxy.ts                  exige sesión en toda la app
```

## Ruta de despliegue en Vercel

1. **Token de Jira**: crea uno en https://id.atlassian.com/manage-profile/security/api-tokens con una cuenta que tenga permiso de lectura sobre los proyectos.
2. **API key de Claude**: créala en https://console.anthropic.com → API Keys.
3. **Repositorio**: sube esta carpeta a un repositorio privado de GitHub.
   ```
   git init
   git add .
   git commit -m "Development Intelligence"
   git branch -M main
   git remote add origin https://github.com/<org>/dev-intelligence.git
   git push -u origin main
   ```
4. **Proyecto en Vercel**: Add New → Project → importa el repositorio. Framework: Next.js (se detecta solo). No cambies los comandos de build.
5. **Variables de entorno** (Settings → Environment Variables, entorno Production y Preview). Ver `.env.example`:

   | Variable | Obligatoria | Ejemplo |
   |---|---|---|
   | `JIRA_SITE` | sí | `https://nutrabiotics.atlassian.net` |
   | `JIRA_EMAIL` | sí | correo de la cuenta dueña del token |
   | `JIRA_API_TOKEN` | sí | token del paso 1 |
   | `JIRA_JQL` | sí | `project in (ALCR, OTRO) AND updated >= -90d ORDER BY updated DESC` |
   | `APP_PASSWORD` | sí | contraseña para entrar a la app |
   | `SESSION_SECRET` | sí | 32+ caracteres aleatorios |
   | `ANTHROPIC_API_KEY` | para el agente | key del paso 2 |
   | `ANTHROPIC_MODEL` | no | `claude-sonnet-5-5` |
   | `JIRA_CACHE_SECONDS` | no | `300` |
   | `JIRA_MAX_PAGES` | no | `20` (100 issues por página) |
   | `DEPLOY_REGEX_PRD` / `_QA` / `_DEV` | no | expresiones que reconocen tus estados por ambiente |
   | `BLOCK_REGEX` | no | estados o etiquetas de bloqueo |
   | `INPROGRESS_DAYS`, `STALE_DAYS` | no | `5` |
   | `NEXT_PUBLIC_REFRESH_MINUTES` | no | `5` |

   Para generar `SESSION_SECRET`:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
6. **Deploy**. Cada cambio de variables requiere volver a desplegar (Deployments → ⋯ → Redeploy).
7. **Dominio propio** (opcional): Settings → Domains → agrega, por ejemplo, `jira.nutrapp.com.co` y crea en GoDaddy el registro CNAME que indique Vercel.

## Desarrollo local

```
cp .env.example .env.local   # y completa los valores
npm install
npm run dev                  # http://localhost:3000
```

## Notas

- **Plan de Vercel**: el agente usa funciones de hasta 300 s (`maxDuration`). En el plan Hobby, si tu proyecto no tiene Fluid Compute, el límite es menor; respuestas largas pueden cortarse. La sincronización usa 60 s.
- **Espacios de Jira Work Management** (URL `/jira/core/...`, como ALCR) no tienen sprints ni story points: esas secciones quedan vacías y la carga se mide en issues.
- **Despliegues**: se infieren de transiciones de estado. Jira no guarda el resultado del pipeline; para eso hay que integrar la fuente de CI/CD.
- **Errores comunes al sincronizar**: 401 = correo o token incorrectos; 400 = JQL inválido o proyecto sin acceso; 0 issues = el JQL no encontró nada (revisa claves y rango de fechas).
