/**
 * Noms des outils de Claude. Une SEULE source : `engine/src/guards/guards.ts` (engine-guards), dont le hook
 * `checkToolUse` décide de chaque appel par ces mêmes constantes. Les dupliquer ici ferait refuser tous les outils MCP le
 * jour où l'un des deux changerait (le test `names.test.ts` fige les valeurs attendues).
 *
 * Le serveur MCP en mémoire s'appelle `kuartz` : Claude voit ses outils sous le nom `mcp__kuartz__<outil>`. Changer ce
 * nom change le préfixe du prompt (cache perdu une fois) et le hook.
 *
 * - ALLOWED_TOOLS : `allowedTools` de query(), TOUJOURS les mêmes dans le même ordre (cache), gelée ;
 * - BUILTIN_TOOLS : `tools` de query() (Read, Edit, Glob, Grep : ni Bash, ni Write, ni Web), gelée ;
 * - MCP_TOOLS : set_text, measure, ask_client, dans l'ordre de déclaration, gelée ;
 * - SITE_DIRS : dossiers du site où Claude lit et cherche (cités par le prompt système), gelée.
 */

export {
  ALLOWED_TOOLS,
  ASK_TOOL,
  BUILTIN_TOOLS,
  MCP_SERVER as MCP_SERVER_NAME,
  MCP_TOOLS,
  MEASURE_TOOL,
  SITE_DIRS,
  TEXT_TOOL,
} from '../guards/guards'
