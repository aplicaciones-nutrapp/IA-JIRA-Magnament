import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { adHocModel } from './jira';
import { DAY, TAG_NAMES, clip, r1, tagsOf } from './rules';
import type { Issue, Model } from './types';

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : undefined);
const day = (t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : undefined);
const has = (a: unknown, b: unknown) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase());

function compact(i: Issue, full = false) {
  const o: Record<string, unknown> = {
    key: i.key, url: i.url, resumen: clip(i.summary, 120), proyecto: i.project.key, tipo: i.type,
    responsable: i.assignee, estado: i.status, categoria: i.cat, dias_en_estado: r1(i.daysInStatus),
    prioridad: i.priority, sp: i.sp ?? undefined, vence: day(i.due), vencido: i.overdue || undefined,
    ultima_actividad: day(i.lastActivity),
    bloqueo: i.blockFacts.length ? i.blockFacts.map((f) => f.why) : undefined,
    posible_bloqueo: i.blockInfer?.why, idas_y_vueltas: i.backMoves || undefined, sprint_activo: i.activeSprint ?? undefined,
  };
  if (full) Object.assign(o, {
    reportado_por: i.reporter, creado: iso(i.created), resuelto: iso(i.resolved), etiquetas: i.labels, versiones: i.versions,
    descripcion: clip(i.description, 900), vinculos: i.links.map((l) => `${l.phrase} ${l.key} (${l.status})`),
    transiciones: i.transitions.map((t) => ({ fecha: iso(t.at), por: t.by, de: t.from, a: t.to })),
    comentarios: i.comments.slice(-10).map((c) => ({ fecha: iso(c.at), autor: c.by, texto: clip(c.text, 700) })),
  });
  return o;
}

/** Recorta listas hasta que el resultado quepa holgadamente en el contexto. */
function cap<T extends { items: unknown[]; truncado?: boolean }>(o: T, max = 40000): T {
  let s = JSON.stringify(o);
  while (s.length > max && o.items.length > 5) {
    o.items = o.items.slice(0, Math.floor(o.items.length * 0.7));
    o.truncado = true;
    s = JSON.stringify(o);
  }
  return o;
}

export function metricsSummary(m: Model) {
  return {
    fecha_referencia: iso(m.ref), jql: m.jql, kpis: m.kpi,
    proyectos: m.projects.map((p) => ({ key: p.key, nombre: p.name, abiertos: p.open, en_curso: p.inprog, vencidos: p.overdue, bloqueados: p.blocked, detenidas: p.stale, resueltos_30d: p.done30, abierto_mas_antiguo_dias: Math.round(p.oldest) })),
    equipo: m.team.map((p) => ({ persona: p.name, abiertos: p.open, en_curso: p.inprog, sp_abiertos: m.hasSP ? p.spOpen : undefined, vencidos: p.overdue, bloqueados: p.blocked, detenidas: p.stale, resueltos_30d: p.done30, sp_resueltos_30d: m.hasSP ? p.spDone30 : undefined, mediana_resolucion_dias: p.medRes, ultima_actividad: day(p.last) })),
    sprints_activos: m.sprints.map((s) => ({ nombre: s.name, inicio: day(s.start), fin: day(s.end), issues: s.total, finalizados: s.done, sp_total: s.spT, sp_finalizados: s.spD, avance_pct: Math.round(s.prog * 100), tiempo_transcurrido_pct: s.elapsed != null ? Math.round(s.elapsed * 100) : null, bloqueados: s.blocked })),
    alertas: m.alerts.map((a) => ({ severidad: a.sev, tipo: a.kind, titulo: a.title, detalle: a.detail, issues: a.keys.slice(0, 8) })),
    reglas: m.rules,
  };
}

type Input = Record<string, unknown>;
interface Tool { def: Anthropic.Tool; run: (a: Input, signal?: AbortSignal) => Promise<unknown> | unknown }

export function agentTools(m: Model): Tool[] {
  const now = m.ref;
  const byKey = new Map(m.issues.map((i) => [i.key, i]));
  const filterIssues = (a: Input, list: Issue[]) => {
    const catMap: Record<string, string> = { por_hacer: 'new', en_curso: 'indeterminate', finalizado: 'done' };
    const c = String(a.categoria || (a.resueltos_ultimos_dias ? 'todos' : 'abiertos'));
    return list.filter((i) => {
      if (a.proyecto && !(has(i.project.key, a.proyecto) || has(i.project.name, a.proyecto))) return false;
      if (a.responsable && !has(i.assignee, a.responsable)) return false;
      if (a.estado && !has(i.status, a.estado)) return false;
      if (c === 'abiertos' && !i.open) return false;
      if (catMap[c] && i.cat !== catMap[c]) return false;
      if (a.texto && !has(`${i.key} ${i.summary}`, a.texto)) return false;
      if (a.vencidos && !i.overdue) return false;
      if (a.bloqueados && !(i.blocked || i.blockInfer)) return false;
      if (a.dias_min_en_estado && !((i.daysInStatus ?? 0) >= Number(a.dias_min_en_estado))) return false;
      if (a.ambiente && i.env !== a.ambiente) return false;
      if (a.sprint_activo && !i.activeSprint) return false;
      if (a.actualizados_ultimos_dias && now - i.lastActivity > Number(a.actualizados_ultimos_dias) * DAY) return false;
      if (a.resueltos_ultimos_dias && !(i.resolved && now - i.resolved <= Number(a.resueltos_ultimos_dias) * DAY)) return false;
      return true;
    }).sort((x, y) => y.prio - x.prio || (y.daysInStatus || 0) - (x.daysInStatus || 0));
  };
  const lim = (a: Input, d: number) => Math.min(80, Number(a.limite) || d);

  return [
    {
      def: {
        name: 'buscar_issues',
        description: 'Busca issues en la sincronización actual de Jira con filtros combinables. Devuelve {total, items} con clave, url, resumen, proyecto, responsable, estado, días en el estado, prioridad, SP, vencimiento y señales de bloqueo.',
        input_schema: { type: 'object', properties: {
          proyecto: { type: 'string', description: 'clave o nombre del proyecto' }, responsable: { type: 'string' }, estado: { type: 'string' },
          categoria: { type: 'string', enum: ['abiertos', 'por_hacer', 'en_curso', 'finalizado', 'todos'] }, texto: { type: 'string' },
          vencidos: { type: 'boolean' }, bloqueados: { type: 'boolean', description: 'bloqueo registrado o inferido' },
          dias_min_en_estado: { type: 'number' }, ambiente: { type: 'string', enum: ['DEV', 'QA', 'PRD'] }, sprint_activo: { type: 'boolean' },
          actualizados_ultimos_dias: { type: 'number' }, resueltos_ultimos_dias: { type: 'number' }, limite: { type: 'number', description: 'máx. 80, por defecto 40' },
        } },
      },
      run: (a) => { const l = filterIssues(a, m.issues); return cap({ total: l.length, items: l.slice(0, lim(a, 40)).map((i) => compact(i)) }); },
    },
    {
      def: { name: 'detalle_issue', description: 'Detalle de un issue por clave: descripción, vínculos, historial completo de transiciones y últimos 10 comentarios.', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
      run: (a) => { const i = byKey.get(String(a.key || '').toUpperCase().trim()); if (!i) throw new Error(`El issue ${a.key} no está en la sincronización actual; usa consultar_jql con key = ${a.key}`); return compact(i, true); },
    },
    { def: { name: 'metricas_equipo', description: 'KPIs globales, estado por proyecto, carga por desarrollador, sprints activos y alertas calculadas.', input_schema: { type: 'object', properties: {} } }, run: () => metricsSummary(m) },
    {
      def: { name: 'stoppers', description: 'Bloqueos: proyecto, issue, responsable, motivos, si es hecho registrado en Jira o inferencia, fecha de identificación, días transcurridos, último comentario, posible responsable de resolverlo y criticidad.', input_schema: { type: 'object', properties: {} } },
      run: () => cap({ total: m.stoppers.length, items: m.stoppers.map((s) => { const i = byKey.get(s.key)!; return { key: s.key, url: i.url, proyecto: i.project.key, resumen: clip(i.summary, 120), responsable: i.assignee, tipo: s.kind, motivos: s.reasons, identificado: day(s.since), dias: r1(s.elapsed), criticidad: s.crit, ultimo_comentario: s.last ? { autor: s.last.by, fecha: day(s.last.at), texto: clip(s.last.text, 300) } : null, posible_resolutor: s.resolver }; }) }),
    },
    {
      def: { name: 'despliegues', description: 'Transiciones hacia estados de ambiente (DEV, QA, PRD) en un rango de días, con issue, quién hizo la transición, fecha, versión y bugs creados en el proyecto en las 72 h posteriores a un paso a PRD. Jira no tiene el resultado del pipeline.', input_schema: { type: 'object', properties: { ambiente: { type: 'string', enum: ['DEV', 'QA', 'PRD'] }, dias: { type: 'number', description: 'por defecto 7' } } } },
      run: (a) => { const d = Number(a.dias) || 7; return cap({ items: m.deploys.filter((x) => (!a.ambiente || x.env === a.ambiente) && now - x.at <= d * DAY).map((x) => { const i = byKey.get(x.key)!; return { fecha: iso(x.at), ambiente: x.env, key: x.key, url: i.url, resumen: clip(i.summary, 100), proyecto: i.project.key, por: x.by, de: x.from, a: x.to, versiones: i.versions, bugs_posteriores_72h: x.after }; }) }); },
    },
    {
      def: { name: 'comentarios', description: 'Comentarios recientes con autor, fecha, issue y etiquetas por palabras clave. Úsala para resumir conversaciones, dependencias, compromisos y riesgos.', input_schema: { type: 'object', properties: { dias: { type: 'number', description: 'por defecto 7' }, proyecto: { type: 'string' }, autor: { type: 'string' }, key: { type: 'string' }, etiqueta: { type: 'string', enum: TAG_NAMES }, limite: { type: 'number' } } } },
      run: (a) => {
        const d = Number(a.dias) || 7; const out: Record<string, unknown>[] = [];
        for (const i of m.issues) {
          if (a.key && i.key !== String(a.key).toUpperCase()) continue;
          if (a.proyecto && !has(i.project.key, a.proyecto)) continue;
          for (const c of i.comments) {
            if (now - c.at > d * DAY) continue;
            if (a.autor && !has(c.by, a.autor)) continue;
            const tg = tagsOf(c.text);
            if (a.etiqueta && !tg.includes(String(a.etiqueta))) continue;
            out.push({ fecha: iso(c.at), autor: c.by, key: i.key, url: i.url, resumen_issue: clip(i.summary, 80), etiquetas: tg, texto: clip(c.text, 400) });
          }
        }
        out.sort((x, y) => (String(x.fecha) < String(y.fecha) ? 1 : -1));
        return cap({ total: out.length, items: out.slice(0, lim(a, 50)) });
      },
    },
    { def: { name: 'evolucion', description: 'Serie semanal de las últimas 12 semanas: issues creados, resueltos y pasos a PRD.', input_schema: { type: 'object', properties: {} } }, run: () => m.weeks.map((w) => ({ semana: day(w.start), creados: w.created, resueltos: w.resolved, pasos_prd: w.prd })) },
    {
      def: { name: 'consultar_jql', description: 'Ejecuta en vivo una consulta JQL de solo lectura contra Jira (máx. 200 issues) para información fuera de la sincronización por defecto: otros proyectos, fechas más antiguas o un issue puntual. Devuelve {total, items} con el mismo formato que buscar_issues.', input_schema: { type: 'object', properties: { jql: { type: 'string' }, limite: { type: 'number' } }, required: ['jql'] } },
      run: async (a, signal) => { const mm = await adHocModel(String(a.jql || ''), signal); return cap({ jql: mm.jql, total: mm.issues.length, truncado: mm.truncated || undefined, items: mm.issues.slice(0, lim(a, 40)).map((i) => compact(i, mm.issues.length <= 3)) }); },
    },
  ];
}

export function systemPrompt(m: Model) {
  return `Eres «Development Intelligence», el agente de inteligencia operativa del área de Aplicaciones Digitales. Ayudas al líder de desarrollo a tener visibilidad del trabajo de los equipos, anticipar problemas y decidir con datos reales de Jira.

FUENTE: Jira Cloud (${m.site}) vía REST API. Sincronización del ${iso(m.ref)} con el JQL: ${m.jql}. ${m.issues.length} issues${m.truncated ? ' (la sincronización alcanzó el límite de páginas; puede haber más)' : ''}.
Herramientas: buscar_issues, detalle_issue, metricas_equipo, stoppers, despliegues, comentarios, evolucion (sobre la sincronización) y consultar_jql (consulta en vivo con JQL para lo que esté fuera de ella).

REGLAS
- Consulta las herramientas antes de afirmar algo sobre el estado actual. No inventes datos ni claves de issues; si la información no alcanza, dilo.
- No asumas que una tarea está bloqueada solo porque lleva mucho tiempo en progreso: revisa comentarios e historial (detalle_issue) antes de concluir.
- No confundas actividad con productividad. No compares desarrolladores solo por cantidad de tareas: considera story points, prioridad, complejidad y contexto.
- La bitácora de despliegues sale de transiciones de estado; Jira no registra el resultado del pipeline. Si te preguntan por resultados de CI/CD, explica que se necesita integrar esa fuente.
- Eres de solo lectura: no modificas tareas, comentarios, estados ni asignaciones.

FORMATO (Markdown, en español, ejecutivo y claro)
- Abre con un resumen de 1 a 3 líneas que responda la pregunta.
- Separa con encabezados en negrita **Hechos (Jira)**, **Inferencias** y **Recomendaciones** cuando aplique.
- Usa tablas para comparativos, listas para tareas y líneas de tiempo cuando haya fechas.
- Escribe cada issue como enlace [CLAVE](url).
- Cierra con una línea en cursiva: _Datos de Jira al <fecha y hora de la sincronización, hora de Colombia>_.
- Sé concreto: cifras, claves, nombres y días. Sin relleno.

RESUMEN ACTUAL (para orientarte; usa las herramientas para el detalle):
${JSON.stringify({ kpis: m.kpi, alertas: m.alerts.slice(0, 8).map((a) => `${a.sev}/${a.kind}: ${a.title}`), sprints: m.sprints.map((s) => `${s.name}: avance ${Math.round(s.prog * 100)}%, tiempo ${s.elapsed != null ? Math.round(s.elapsed * 100) : '?'}%`) })}`;
}
