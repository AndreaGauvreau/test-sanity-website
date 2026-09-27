import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { credentialEnv, type MachineLogin } from '../claude'

/**
 * Connexion Claude Code de la machine du moteur (« Use my Claude subscription », moteur local seulement).
 *
 * Vérifié dans le binaire Claude Code 2.1.283 livré avec l'Agent SDK 0.3.283 (`node_modules/@anthropic-ai/
 * claude-agent-sdk-darwin-arm64/claude`) :
 * - macOS : identifiants dans le trousseau, service « Claude Code-credentials » (+ `-<sha256(dossier)[0..8]>` si
 *   CLAUDE_CONFIG_DIR ou CLAUDE_SECURESTORAGE_CONFIG_DIR non vide est posé), compte `$USER` (sinon `os.userInfo()`,
 *   « claude-code-user » s'il contient autre chose que [a-zA-Z0-9._-]) ; lu par `security find-generic-password`.
 * - ailleurs (ou repli) : `<dossier>/.credentials.json`, dossier = CLAUDE_SECURESTORAGE_CONFIG_DIR ou `~/.claude`.
 *
 * Sonde retenue : `claude auth status --json` du binaire de l'Agent SDK, avec EXACTEMENT l'env minimal du vrai appel
 * (PATH, HOME, USER, CLAUDE_SECURESTORAGE_CONFIG_DIR, CLAUDE_CONFIG_DIR dédié) : aucun appel au modèle, ≈ 0,1 s, et
 * c'est Claude Code lui-même qui dit s'il trouve une connexion utilisable. Seuls `loggedIn` est lu (la sortie ne contient
 * aucun secret). Constat du 2026-09-27 : la simple PRÉSENCE de l'élément « Claude Code-credentials » dans le trousseau ne
 * suffit pas (il peut ne contenir que des jetons MCP ou une connexion périmée) : ce n'est plus qu'un repli, quand le
 * binaire est introuvable. On ne lit JAMAIS le secret. Le vrai contrôle reste le test de connexion (un tour minimal).
 */

export type MachineLoginStatus = { loggedIn: boolean; where?: 'claude' | 'keychain' | 'file' }

export type MachineProbe = {
  platform: NodeJS.Platform
  home: string
  user: string | undefined
  /** `security find-generic-password -a <compte> -s <service>` (sans -w) : code de sortie 0 = présent. */
  keychainHas: (service: string, account: string) => Promise<boolean>
  fileExists: (file: string) => Promise<boolean>
  /** `claude auth status --json` (binaire de l'Agent SDK) : loggedIn, ou null si le binaire manque ou répond mal. */
  authStatus?: (login: MachineLogin) => Promise<boolean | null>
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const ACCOUNT_PATTERN = /^[a-zA-Z0-9._-]+$/

/**
 * Où chercher la connexion : CLAUDE_SECURESTORAGE_CONFIG_DIR de l'environnement du moteur, sinon son CLAUDE_CONFIG_DIR
 * (celui de `claude` dans le même terminal), sinon '' (emplacement par défaut, cas courant).
 */
export function machineLoginOf(env: Readonly<Record<string, string | undefined>>): MachineLogin {
  const storage = env.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? env.CLAUDE_CONFIG_DIR ?? ''
  return { storageDir: storage.trim() }
}

/** Nom du service du trousseau, calculé comme Claude Code. */
export function keychainService(login: MachineLogin): string {
  const dir = login.storageDir
  return dir ? `${KEYCHAIN_SERVICE}-${createHash('sha256').update(dir.normalize('NFC')).digest('hex').slice(0, 8)}` : KEYCHAIN_SERVICE
}

/** Compte du trousseau, calculé comme Claude Code. */
export function keychainAccount(user: string | undefined): string {
  let name = user
  if (!name) {
    try {
      name = os.userInfo().username
    } catch {
      name = 'claude-code-user'
    }
  }
  return ACCOUNT_PATTERN.test(name) ? name : 'claude-code-user'
}

export function credentialsFile(login: MachineLogin, home: string): string {
  return path.join(login.storageDir || path.join(home, '.claude'), '.credentials.json')
}

/** Binaire Claude Code de l'Agent SDK (même résolution que le SDK : paquet natif de la plateforme), ou null. */
export function claudeBinary(): string | null {
  const require = createRequire(import.meta.url)
  const base = '@anthropic-ai/claude-agent-sdk'
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const names =
    process.platform === 'linux'
      ? [`${base}-linux-${process.arch}`, `${base}-linux-${process.arch}-musl`]
      : [`${base}-${process.platform}-${process.arch}`]
  for (const name of names) {
    try {
      const file = require.resolve(`${name}/claude${suffix}`)
      if (existsSync(file)) return file
    } catch {
      // paquet absent : suivant
    }
  }
  return null
}

/**
 * Sonde réelle. `configDir` : CLAUDE_CONFIG_DIR dédié (celui du test de connexion), jamais ~/.claude.
 * `binary` : remplaçable (tests) ; défaut `claudeBinary()`.
 */
export function systemProbe(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: { configDir?: string; binary?: string | null } = {},
): MachineProbe {
  const binary = options.binary !== undefined ? options.binary : claudeBinary()
  const configDir = options.configDir
  return {
    authStatus:
      binary && configDir
        ? async (login) => {
            await mkdir(configDir, { recursive: true })
            // Env minimal, identique au vrai appel (credentialEnv) : jamais ...process.env, aucun secret du moteur.
            const childEnv = {
              PATH: env.PATH,
              HOME: env.HOME,
              ...credentialEnv({ kind: 'subscription', secret: null, machineLogin: login }, env),
              CLAUDE_CONFIG_DIR: configDir,
            } as unknown as NodeJS.ProcessEnv
            return new Promise<boolean | null>((resolve) => {
              execFile(binary, ['auth', 'status', '--json'], { timeout: 15_000, env: childEnv, cwd: configDir, maxBuffer: 64 * 1024 }, (_error, stdout) => {
                try {
                  const parsed = JSON.parse(String(stdout)) as { loggedIn?: unknown }
                  resolve(typeof parsed.loggedIn === 'boolean' ? parsed.loggedIn : null)
                } catch {
                  resolve(null)
                }
              })
            })
          }
        : undefined,
    platform: process.platform,
    home: env.HOME || os.homedir(),
    user: env.USER,
    keychainHas: (service, account) =>
      new Promise((resolve) => {
        // Attributs seulement (pas de -w) : aucun secret lu, aucune fenêtre d'autorisation du trousseau.
        const childEnv = { PATH: '/usr/bin:/bin', ...(env.HOME ? { HOME: env.HOME } : {}) } as unknown as NodeJS.ProcessEnv
        execFile('/usr/bin/security', ['find-generic-password', '-a', account, '-s', service], { timeout: 5_000, env: childEnv }, (error: Error | null) =>
          resolve(!error),
        )
      }),
    fileExists: (file) =>
      access(file).then(
        () => true,
        () => false,
      ),
  }
}

export async function detectMachineLogin(login: MachineLogin, probe: MachineProbe): Promise<MachineLoginStatus> {
  const status = probe.authStatus ? await probe.authStatus(login).catch(() => null) : null
  if (status !== null) return status ? { loggedIn: true, where: 'claude' } : { loggedIn: false }
  // Repli (binaire introuvable) : présence de l'élément du trousseau ou du fichier.
  if (probe.platform === 'darwin' && (await probe.keychainHas(keychainService(login), keychainAccount(probe.user)).catch(() => false))) {
    return { loggedIn: true, where: 'keychain' }
  }
  if (await probe.fileExists(credentialsFile(login, probe.home)).catch(() => false)) return { loggedIn: true, where: 'file' }
  return { loggedIn: false }
}
