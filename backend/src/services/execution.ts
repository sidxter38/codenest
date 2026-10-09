import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { spawn } from 'child_process'

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  status: string
  time?: string
  memory?: string
  compileOutput?: string
  waitingForInput?: boolean
  inputPrompt?: string
}

export interface SourceFile {
  name: string
  content: string
}

const JUDGE0_LANG_IDS: Record<string, number> = {
  javascript: 63, // Node.js
  python:     71  // Python 3
}

const JUDGE0_STATUS_MAP: Record<number, string> = {
  1: 'In Queue', 2: 'Processing', 3: 'Accepted', 4: 'Wrong Answer',
  5: 'Time Limit Exceeded', 6: 'Compilation Error',
  7: 'Runtime Error (SIGSEGV)', 8: 'Runtime Error (SIGXFSZ)',
  9: 'Runtime Error (SIGFPE)', 10: 'Runtime Error (SIGABRT)',
  11: 'Runtime Error (NZEC)', 12: 'Runtime Error (Other)',
  13: 'Internal Error', 14: 'Exec Format Error'
}

/**
 * Sanitizes output from process execution:
 * - Normalizes Windows CRLF to LF
 * - Strips ANSI escape sequences (colors, cursor movements, OSC commands)
 * - Strips orphaned ANSI codes (e.g. [33m, [39m) if the ESC character was dropped
 * - Removes non-printable ASCII control characters except \n and \t
 */
export function sanitizeTerminalOutput(str: string | undefined): string {
  if (!str) return ''
  return str
    .replace(/\r\n/g, '\n')
    // Standard ANSI CSI escape codes (e.g. \u001b[33m)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    // Standard ANSI OSC escape codes
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    // Orphaned ANSI codes where ESC character was dropped or omitted
    .replace(/\[\d{1,3}(?:;\d{1,3})*m/g, '')
    // Non-printable control characters except \n, \r, \t
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function cleanExecutionResult(res: ExecutionResult): ExecutionResult {
  return {
    ...res,
    stdout: sanitizeTerminalOutput(res.stdout),
    stderr: sanitizeTerminalOutput(res.stderr),
    compileOutput: res.compileOutput ? sanitizeTerminalOutput(res.compileOutput) : undefined,
    inputPrompt: res.inputPrompt ? sanitizeTerminalOutput(res.inputPrompt) : undefined
  }
}

/**
 * Execute code safely across 3 execution tiers:
 * 1. Judge0 Container API (if JUDGE0_URL configured)
 * 2. Ephemeral Docker Sandbox (`python:3.11-alpine`, `node:18-alpine` if Docker daemon is active)
 * 3. Local Isolated Runtime (Node.js & Python with stdin support)
 */
export async function executeCode(
  code: string,
  language: string,
  filesOrStdin?: SourceFile[] | string,
  stdin?: string
): Promise<ExecutionResult> {
  const lang = language.toLowerCase()
  const judge0Url = (process.env.JUDGE0_URL || '').trim()
  const judge0Key = (process.env.JUDGE0_API_KEY || '').trim()

  let files: SourceFile[] | undefined
  let actualStdin: string | undefined

  if (typeof filesOrStdin === 'string') {
    actualStdin = filesOrStdin
    files = undefined
  } else {
    files = filesOrStdin
    actualStdin = stdin
  }

  // 1. Judge0 Provider
  if (judge0Url && JUDGE0_LANG_IDS[lang]) {
    try {
      const res = await executeViaJudge0(code, lang, judge0Url, judge0Key || undefined, actualStdin)
      return cleanExecutionResult(res)
    } catch (err: unknown) {
      console.warn('[Execute] Judge0 error:', (err as { message?: string }).message, '— trying Docker sandbox.')
    }
  }

  // 2. Ephemeral Docker Sandbox Runner
  try {
    const dockerResult = await executeViaDockerSandbox(code, lang, files, actualStdin)
    if (dockerResult) {
      return cleanExecutionResult(dockerResult)
    }
  } catch (err: unknown) {
    console.warn('[Execute] Docker sandbox check:', (err as { message?: string }).message)
  }

  // 3. Local Isolated Runtime (Node.js & Python with stdin support)
  try {
    const localResult = await executeViaLocalRuntime(code, lang, files, actualStdin)
    return cleanExecutionResult(localResult)
  } catch (err: unknown) {
    console.error('[Execute] Local runtime error:', (err as { message?: string }).message)
    return {
      stdout: '',
      stderr: `Execution failed: ${(err as Error).message}`,
      exitCode: 1,
      status: 'Execution Error'
    }
  }
}

async function executeViaJudge0(
  code: string,
  lang: string,
  baseUrl: string,
  apiKey: string | undefined,
  stdin?: string
): Promise<ExecutionResult> {
  const langId = JUDGE0_LANG_IDS[lang]
  if (!langId) throw new Error(`Judge0: unsupported language: ${lang}`)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    headers['X-RapidAPI-Key'] = apiKey
    headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com'
  }

  const response = await axios.post(
    `${baseUrl}/submissions?base64_encoded=false&wait=true`,
    {
      language_id: langId,
      source_code: code,
      stdin: stdin || '',
      cpu_time_limit: 10,
      memory_limit: 131072 // 128 MB
    },
    { headers, timeout: 25000 }
  )

  const r = response.data
  return {
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    exitCode: r.exit_code ?? (r.status?.id === 3 ? 0 : 1),
    status: JUDGE0_STATUS_MAP[r.status?.id] || r.status?.description || 'Unknown',
    time: r.time ? `${r.time}s` : undefined,
    memory: r.memory ? `${r.memory} KB` : undefined,
    compileOutput: r.compile_output || undefined
  }
}

/**
 * Executes code inside an ephemeral, resource-constrained Docker container (if daemon is running)
 */
async function executeViaDockerSandbox(
  code: string,
  lang: string,
  files?: SourceFile[],
  stdin?: string
): Promise<ExecutionResult | null> {
  let image = ''
  let defaultFileName = ''

  if (lang === 'python' || lang === 'py') {
    image = 'python:3.11-alpine'
    defaultFileName = 'main.py'
  } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
    image = 'node:18-alpine'
    defaultFileName = 'main.js'
  } else {
    return null
  }

  const runId = crypto.randomBytes(8).toString('hex')
  const tempDir = path.join(os.tmpdir(), `codenest-docker-${runId}`)
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    if (files && files.length > 0) {
      for (const f of files) {
        const filePath = path.join(tempDir, f.name)
        const parentDir = path.dirname(filePath)
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true })
        fs.writeFileSync(filePath, f.content, 'utf-8')
      }
      if (!files.some(f => f.name === defaultFileName)) {
        fs.writeFileSync(path.join(tempDir, defaultFileName), code, 'utf-8')
      }
    } else {
      fs.writeFileSync(path.join(tempDir, defaultFileName), code, 'utf-8')
    }

    let containerCmd = ''
    if (lang === 'python' || lang === 'py') {
      containerCmd = 'python -u main.py'
    } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
      containerCmd = 'node main.js'
    }

    const dockerArgs = [
      'run', '--rm',
      '-i',
      '--net=none',
      '--memory=128m',
      '--cpus=0.5',
      '--pids-limit=64',
      '-e', 'NO_COLOR=1',
      '-e', 'NODE_DISABLE_COLORS=1',
      '-e', 'FORCE_COLOR=0',
      '-e', 'TERM=dumb',
      '-e', 'PYTHONUNBUFFERED=1',
      '-e', 'PYTHONDONTWRITEBYTECODE=1',
      '-v', `${tempDir}:/workspace:rw`,
      '-w', '/workspace',
      image,
      'sh', '-c', containerCmd
    ]

    const t0 = performance.now()
    const proc = spawn('docker', dockerArgs, {
      timeout: 10000
    })

    if (stdin && proc.stdin) {
      proc.stdin.write(stdin.endsWith('\n') ? stdin : stdin + '\n')
      proc.stdin.end()
    } else if (proc.stdin) {
      proc.stdin.end()
    }

    let stdout = ''
    let stderr = ''

    return await new Promise<ExecutionResult | null>((resolve) => {
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < 1024 * 1024) stdout += chunk.toString()
      })
      proc.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 1024 * 1024) stderr += chunk.toString()
      })

      proc.on('close', (code: number | null) => {
        // Detect Docker daemon connection failures and fall back to local runtime
        const dockerDaemonErrors = [
          'failed to connect to the docker API',
          'dockerDesktopLinuxEngine',
          'Cannot connect to the Docker daemon',
          'Is the docker daemon running',
          'daemon is not running',
          'error during connect',
          'The system cannot find the file specified',
          'npipe:'
        ]
        if (dockerDaemonErrors.some(errText => stderr.includes(errText))) {
          console.warn('[Docker Sandbox] Docker daemon is unavailable, falling back to local runtime.')
          resolve(null)
          return
        }

        const elapsed = ((performance.now() - t0) / 1000).toFixed(3)

        // Check if program halted because it was waiting for interactive input (EOFError)
        const isEOFError = stderr.includes('EOFError') || stderr.includes('EOF when reading a line')
        if (isEOFError) {
          const lines = stdout.trim().split('\n')
          const prompt = lines[lines.length - 1] || 'Input required:'
          resolve({
            stdout,
            stderr: '',
            exitCode: 0,
            status: 'Waiting for Input',
            time: `${elapsed}s`,
            waitingForInput: true,
            inputPrompt: prompt
          })
          return
        }

        const isCompileError = stderr.includes('SyntaxError') || stderr.includes('error:')
        resolve({
          stdout,
          stderr: isCompileError ? '' : stderr,
          compileOutput: isCompileError ? stderr : undefined,
          exitCode: code ?? 0,
          status: code === 0 ? 'Accepted' : (isCompileError ? 'Compilation Error' : 'Runtime Error'),
          time: `${elapsed}s`
        })
      })

      proc.on('error', (_err: Error) => {
        resolve(null)
      })
    })

  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }
}

/**
 * Executes code using the local runtime (Node.js / Python) with stdin support
 */
async function executeViaLocalRuntime(
  code: string,
  lang: string,
  files?: SourceFile[],
  stdin?: string
): Promise<ExecutionResult> {
  const runId = crypto.randomBytes(8).toString('hex')
  const tempDir = path.join(os.tmpdir(), `codenest-local-${runId}`)
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    let executable = ''
    let args: string[] = []
    let defaultFileName = 'main.py'

    if (lang === 'python' || lang === 'py') {
      defaultFileName = 'main.py'
      executable = process.platform === 'win32' ? 'python' : 'python3'
      args = ['-u', 'main.py']
    } else if (lang === 'javascript' || lang === 'js' || lang === 'node') {
      defaultFileName = 'main.js'
      executable = process.execPath || 'node'
      args = ['main.js']
    } else {
      return {
        stdout: `Language "${lang}" is not supported for local execution.`,
        stderr: '',
        exitCode: 1,
        status: 'Unsupported Language'
      }
    }

    const nodePromptShim = `
if (typeof prompt === 'undefined') {
  globalThis.prompt = function(msg) {
    if (msg) process.stdout.write(String(msg));
    try {
      const fs = require('fs');
      const buf = Buffer.alloc(1);
      let str = '';
      while (fs.readSync(0, buf, 0, 1) !== 0) {
        const c = buf.toString('utf-8', 0, 1);
        if (c === '\\n') break;
        if (c !== '\\r') str += c;
      }
      return str;
    } catch {
      return '';
    }
  };
}
`

    // Write source files into tempDir
    if (files && files.length > 0) {
      for (const f of files) {
        const filePath = path.join(tempDir, f.name)
        const parentDir = path.dirname(filePath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        let content = f.content
        if ((lang === 'javascript' || lang === 'js' || lang === 'node') && f.name === defaultFileName) {
          content = nodePromptShim + '\n' + content
        }
        fs.writeFileSync(filePath, content, 'utf-8')
      }
      if (!files.some(f => f.name === defaultFileName)) {
        let content = code
        if (lang === 'javascript' || lang === 'js' || lang === 'node') {
          content = nodePromptShim + '\n' + content
        }
        fs.writeFileSync(path.join(tempDir, defaultFileName), content, 'utf-8')
      }
    } else {
      let content = code
      if (lang === 'javascript' || lang === 'js' || lang === 'node') {
        content = nodePromptShim + '\n' + content
      }
      fs.writeFileSync(path.join(tempDir, defaultFileName), content, 'utf-8')
    }

    const t0 = performance.now()
    const cleanEnv: NodeJS.ProcessEnv = {
      ...process.env,
      FORCE_COLOR: '0',
      NODE_DISABLE_COLORS: '1',
      NO_COLOR: '1',
      TERM: 'dumb',
      PYTHONUNBUFFERED: '1',
      PYTHONDONTWRITEBYTECODE: '1'
    }
    delete cleanEnv.COLOR

    const proc = spawn(executable, args, {
      cwd: tempDir,
      timeout: 10000,
      windowsHide: true,
      env: cleanEnv
    })

    if (proc.stdin) {
      if (stdin != null && stdin !== '') {
        proc.stdin.write(stdin.endsWith('\n') ? stdin : stdin + '\n')
      }
      proc.stdin.end()
    }

    let stdout = ''
    let stderr = ''

    return await new Promise<ExecutionResult>((resolve) => {
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < 1024 * 1024) stdout += chunk.toString()
      })
      proc.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 1024 * 1024) stderr += chunk.toString()
      })

      proc.on('close', (code: number | null) => {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(3)

        // Check if program halted because it was waiting for interactive input (EOFError)
        const isEOFError = stderr.includes('EOFError') || stderr.includes('EOF when reading a line')
        if (isEOFError) {
          const lines = stdout.trim().split('\n')
          const prompt = lines[lines.length - 1] || 'Input required:'
          resolve({
            stdout,
            stderr: '',
            exitCode: 0,
            status: 'Waiting for Input',
            time: `${elapsed}s`,
            waitingForInput: true,
            inputPrompt: prompt
          })
          return
        }

        const isCompileError = stderr.includes('SyntaxError') || stderr.includes('error:')
        resolve({
          stdout,
          stderr: isCompileError ? '' : stderr,
          compileOutput: isCompileError ? stderr : undefined,
          exitCode: code ?? 0,
          status: code === 0 ? 'Accepted' : (isCompileError ? 'Compilation Error' : 'Runtime Error'),
          time: `${elapsed}s`
        })
      })

      proc.on('error', (err: Error) => {
        resolve({
          stdout: '',
          stderr: `Failed to execute ${executable}: ${err.message}`,
          exitCode: 1,
          status: 'Execution Error'
        })
      })
    })
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }
}
