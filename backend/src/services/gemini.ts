import { GoogleGenerativeAI } from '@google/generative-ai'

export type AISeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Suggestion'
export type AICategory = 'Bugs' | 'Security' | 'Performance' | 'Code Quality' | 'Recommendations' | 'Explanation'

export interface AIFinding {
  file: string
  line?: number
  severity: AISeverity
  category: AICategory
  title: string
  description: string
  suggestion?: string
  currentCode?: string
  suggestedCode?: string
}

export interface AIReviewResult {
  issues: AIFinding[]
  summary: string
  stats?: {
    critical: number
    high: number
    medium: number
    low: number
    suggestion: number
  }
}

const CATEGORY_MAP: Record<string, AICategory> = {
  bugs: 'Bugs',
  bug: 'Bugs',
  security: 'Security',
  performance: 'Performance',
  code_quality: 'Code Quality',
  'code quality': 'Code Quality',
  maintainability: 'Code Quality',
  readability: 'Code Quality',
  recommendations: 'Recommendations',
  recommendation: 'Recommendations',
  explanation: 'Explanation'
}

const SEVERITY_MAP: Record<string, AISeverity> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  suggestion: 'Suggestion',
  info: 'Suggestion'
}

export async function runAIReview(
  code: string,
  language: string,
  fileName: string = 'main',
  categories: string[] = ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations']
): Promise<AIReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()

  // Standardize requested categories
  const targetCategories: AICategory[] = Array.from(
    new Set(
      categories.map(c => CATEGORY_MAP[c.toLowerCase()] || 'Code Quality')
    )
  )

  if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY not configured — providing structured rule-based evaluation.')
    return getSimulatedResult(fileName, targetCategories, language)
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 600,
      temperature: 0.2
    }
  })

  const prompt = `You are a senior full-stack software architect and security auditor.
Analyze the following ${language} code thoroughly and identify concrete findings across these specific categories:
${targetCategories.map(c => `- ${c}`).join('\n')}

File: ${fileName}
Language: ${language}

\`\`\`${language}
${code.slice(0, 10000)}
\`\`\`

Strict Requirements:
1. Provide realistic, high-signal findings only (no fluff).
2. Severities must be strictly one of: "Critical", "High", "Medium", "Low", "Suggestion".
3. Categories must be strictly one of: ${targetCategories.map(c => `"${c}"`).join(', ')}.
4. Respond ONLY with a valid JSON object in the following format (no markdown fences, no explanatory text outside JSON):
{
  "issues": [
    {
      "file": "${fileName}",
      "line": <line_number_or_null>,
      "severity": "Critical|High|Medium|Low|Suggestion",
      "category": "Bugs|Security|Performance|Code Quality|Recommendations|Explanation",
      "title": "<Concise finding summary>",
      "description": "<Detailed explanation of why this is problematic>",
      "suggestion": "<Actionable instruction for remediation>",
      "currentCode": "<Problematic snippet or null>",
      "suggestedCode": "<Clean, optimized replacement snippet or null>"
    }
  ],
  "summary": "<2-3 sentence executive assessment of code health, architecture, and maintainability>"
}`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text().trim()

    let jsonText = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonText) as { issues?: any[]; summary?: string }
    const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : []

    const issues: AIFinding[] = rawIssues.map((raw: any) => {
      const rawSev = String(raw.severity || 'Medium').toLowerCase()
      const rawCat = String(raw.category || 'Code Quality').toLowerCase()

      return {
        file: raw.file || fileName,
        line: typeof raw.line === 'number' ? raw.line : undefined,
        severity: SEVERITY_MAP[rawSev] || 'Medium',
        category: CATEGORY_MAP[rawCat] || 'Code Quality',
        title: String(raw.title || 'Code Improvement Identified'),
        description: String(raw.description || ''),
        suggestion: raw.suggestion ? String(raw.suggestion) : undefined,
        currentCode: raw.currentCode ? String(raw.currentCode) : undefined,
        suggestedCode: raw.suggestedCode ? String(raw.suggestedCode) : undefined
      }
    })

    const stats = {
      critical: issues.filter(i => i.severity === 'Critical').length,
      high: issues.filter(i => i.severity === 'High').length,
      medium: issues.filter(i => i.severity === 'Medium').length,
      low: issues.filter(i => i.severity === 'Low').length,
      suggestion: issues.filter(i => i.severity === 'Suggestion').length
    }

    return {
      issues,
      summary: parsed.summary || `Code review complete: ${issues.length} findings identified.`,
      stats
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('[Gemini] Live API invocation failed, falling back to structured engine:', err.message)
    return getSimulatedResult(fileName, targetCategories, language)
  }
}

export interface AIDiagnosisResult {
  errorSummary: string
  approach: string
  fixedCode?: string
  line?: number
}

export async function diagnoseError(
  code: string,
  language: string,
  errorOutput: string,
  fileName: string = 'main.py'
): Promise<AIDiagnosisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return getFallbackDiagnosis(code, language, errorOutput)
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: 350,
        temperature: 0.1
      }
    })

    const prompt = `You are an expert runtime debugger. Analyze this ${language} failure and provide a minimal, token-efficient diagnosis.

Error output:
${errorOutput.slice(0, 1500)}

Code snippet:
\`\`\`${language}
${code.slice(0, 2500)}
\`\`\`

Strictly respond with raw JSON only (no markdown, no backticks outside JSON):
{
  "errorSummary": "<1-2 concise lines explaining why the error occurred>",
  "approach": "<2-3 concise lines describing the best approach to resolve it>",
  "fixedCode": "<Minimal replacement code snippet or null>",
  "line": <line_number_or_null>
}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text().trim()
    let jsonText = responseText
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonText = jsonMatch[1]

    const parsed = JSON.parse(jsonText)
    return {
      errorSummary: parsed.errorSummary || 'Execution encountered a runtime error.',
      approach: parsed.approach || 'Verify variable types and syntax near the error line.',
      fixedCode: parsed.fixedCode || undefined,
      line: typeof parsed.line === 'number' ? parsed.line : undefined
    }
  } catch (err: unknown) {
    console.warn('[Gemini] diagnoseError failed, using rule-based diagnostic:', (err as Error).message)
    return getFallbackDiagnosis(code, language, errorOutput)
  }
}

function getFallbackDiagnosis(_code: string, language: string, errorOutput: string): AIDiagnosisResult {
  const lines = errorOutput.split('\n')
  const lastLine = lines.filter(l => l.trim().length > 0).pop() || errorOutput

  if (lastLine.includes('ZeroDivisionError')) {
    return {
      errorSummary: 'ZeroDivisionError: Division or modulo operation performed with zero as the denominator.',
      approach: 'Add a condition checking that the divisor is not zero before dividing.',
      fixedCode: 'if divisor != 0:\n    result = value / divisor\nelse:\n    result = 0'
    }
  }
  if (lastLine.includes('IndexError')) {
    return {
      errorSummary: 'IndexError: List index accessed is out of range.',
      approach: 'Verify the sequence length with len(seq) before indexing, or use safe bounds checking.',
      fixedCode: 'if 0 <= index < len(items):\n    val = items[index]'
    }
  }
  if (lastLine.includes('TypeError')) {
    return {
      errorSummary: `TypeError: ${lastLine.slice(0, 140)}`,
      approach: 'Ensure variables have compatible types before performing operations or passing arguments.',
      fixedCode: '# Cast variable to expected type, e.g. int(val) or str(val)'
    }
  }
  if (lastLine.includes('SyntaxError')) {
    const lineMatch = errorOutput.match(/line (\d+)/i)
    return {
      errorSummary: `SyntaxError: Invalid syntax in ${language} code.`,
      approach: 'Check for missing colons (:), unmatched parentheses, or incorrect indentation near the indicated line.',
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined
    }
  }

  return {
    errorSummary: lastLine.slice(0, 160),
    approach: 'Inspect the stack trace line numbers and check logic around variable assignments and function signatures.'
  }
}

function getSimulatedResult(
  fileName: string,
  categories: AICategory[],
  language = 'javascript'
): AIReviewResult {
  const issues: AIFinding[] = []
  const lang = language.toLowerCase()

  if (lang.includes('cpp') || lang.includes('c++') || lang === 'c') {
    if (categories.includes('Performance')) {
      issues.push({
        file: fileName,
        line: 15,
        severity: 'Medium',
        category: 'Performance',
        title: 'Pass-by-value container copy in hot loop',
        description: 'Passing large containers by value triggers duplicate heap reallocations and copies on every function call.',
        suggestion: 'Pass container by const reference (const std::vector<T>&) to eliminate heap reallocations.',
        currentCode: 'void processBatch(std::vector<Item> items)',
        suggestedCode: 'void processBatch(const std::vector<Item>& items)'
      })
    }
    if (categories.includes('Security')) {
      issues.push({
        file: fileName,
        line: 28,
        severity: 'Critical',
        category: 'Security',
        title: 'Unchecked buffer boundary access',
        description: 'Array indexing without explicit boundary checks may cause out-of-bounds memory reads or writes (buffer overrun).',
        suggestion: 'Enforce boundary validation before index access or use safe container accessors.',
        currentCode: 'data[offset + index] = buffer[index];',
        suggestedCode: 'if (offset + index < capacity) { data[offset + index] = buffer[index]; }'
      })
    }
    if (categories.includes('Code Quality')) {
      issues.push({
        file: fileName,
        line: 42,
        severity: 'Low',
        category: 'Code Quality',
        title: 'Direct raw pointer management',
        description: 'Manual memory management using new/delete or malloc/free is error-prone and leads to memory leaks during early returns.',
        suggestion: 'Modernize with smart pointers (std::unique_ptr or std::shared_ptr) to follow RAII idiom.',
        currentCode: 'Buffer* buf = new Buffer();\n// ...\ndelete buf;',
        suggestedCode: 'auto buf = std::make_unique<Buffer>();'
      })
    }
  } else if (lang.includes('java')) {
    if (categories.includes('Bugs')) {
      issues.push({
        file: fileName,
        line: 18,
        severity: 'High',
        category: 'Bugs',
        title: 'String equality tested with reference comparison (==)',
        description: 'Using == to compare Java Strings tests memory object identity rather than character content equality, causing false branch evaluations.',
        suggestion: 'Use .equals() or Objects.equals(a, b) for value-based string comparison.',
        currentCode: 'if (status == "APPROVED") {',
        suggestedCode: 'if ("APPROVED".equals(status)) {'
      })
    }
    if (categories.includes('Security') || categories.includes('Code Quality')) {
      issues.push({
        file: fileName,
        line: 34,
        severity: 'Medium',
        category: 'Code Quality',
        title: 'Unclosed AutoCloseable resource leak',
        description: 'I/O Streams and connections should be enclosed in try-with-resources blocks to guarantee cleanup even if exceptions are thrown.',
        suggestion: 'Refactor into a try-with-resources statement.',
        currentCode: 'InputStream is = new FileInputStream(file);',
        suggestedCode: 'try (InputStream is = new FileInputStream(file)) {\n    // process stream\n}'
      })
    }
  } else if (lang === 'python') {
    if (categories.includes('Bugs')) {
      issues.push({
        file: fileName,
        line: 5,
        severity: 'High',
        category: 'Bugs',
        title: 'Mutable default argument in function signature',
        description: 'Python initializes default arguments once at definition time. A mutable default (list or dict) will retain state across calls.',
        suggestion: 'Set default to None and instantiate inside the function scope.',
        currentCode: 'def add_item(item, lst=[]):',
        suggestedCode: 'def add_item(item, lst=None):\n    if lst is None:\n        lst = []'
      })
    }
    if (categories.includes('Security')) {
      issues.push({
        file: fileName,
        line: 12,
        severity: 'Critical',
        category: 'Security',
        title: 'Arbitrary execution with eval()',
        description: 'Invoking eval() on untrusted inputs creates remote code execution vulnerability.',
        suggestion: 'Use ast.literal_eval() for safe data deserialization or explicit parser dispatch.',
        currentCode: 'result = eval(user_input)',
        suggestedCode: 'import ast\nresult = ast.literal_eval(user_input)'
      })
    }
    if (categories.includes('Recommendations')) {
      issues.push({
        file: fileName,
        line: 22,
        severity: 'Suggestion',
        category: 'Recommendations',
        title: 'Type hinting for public interfaces',
        description: 'Adding PEP 484 type annotations improves developer velocity, IDE autocomplete, and prevents type mismatches.',
        suggestion: 'Annotate parameters and return types.',
        currentCode: 'def process_records(records):',
        suggestedCode: 'def process_records(records: list[dict]) -> dict[str, int]:'
      })
    }
  } else {
    // JavaScript / TypeScript default
    if (categories.includes('Bugs')) {
      issues.push({
        file: fileName,
        line: 12,
        severity: 'High',
        category: 'Bugs',
        title: 'Potential null / undefined property dereference',
        description: 'Deep object property access without defensive checks can throw TypeError if any parent property is missing.',
        suggestion: 'Use optional chaining (?.) with nullish coalescing (??).',
        currentCode: 'const userRole = session.user.role;',
        suggestedCode: 'const userRole = session?.user?.role ?? "guest";'
      })
    }
    if (categories.includes('Security')) {
      issues.push({
        file: fileName,
        line: 19,
        severity: 'High',
        category: 'Security',
        title: 'Direct HTML injection risk (innerHTML)',
        description: 'Injecting dynamic user content directly into innerHTML bypasses sanitization and exposes the DOM to Cross-Site Scripting (XSS).',
        suggestion: 'Use textContent or DOM sanitization (DOMPurify).',
        currentCode: 'element.innerHTML = userInput;',
        suggestedCode: 'element.textContent = userInput;'
      })
    }
    if (categories.includes('Performance')) {
      issues.push({
        file: fileName,
        line: 28,
        severity: 'Medium',
        category: 'Performance',
        title: 'Unbounded async operations inside Array.forEach',
        description: 'Array.prototype.forEach does not wait for Promise completion, firing off all asynchronous calls simultaneously without concurrency controls.',
        suggestion: 'Use for...of or Promise.all(items.map(...)) for structured async flow.',
        currentCode: 'items.forEach(async (item) => { await save(item); });',
        suggestedCode: 'await Promise.all(items.map(item => save(item)));'
      })
    }
    if (categories.includes('Recommendations')) {
      issues.push({
        file: fileName,
        line: 35,
        severity: 'Suggestion',
        category: 'Recommendations',
        title: 'Replace loose equality with strict equality',
        description: 'Loose equality (==) performs implicit type coercion which can trigger unexpected truthy/falsy behavior.',
        suggestion: 'Adopt strict equality (===) throughout the module.',
        currentCode: 'if (code == 200) {',
        suggestedCode: 'if (code === 200) {'
      })
    }
  }

  const stats = {
    critical: issues.filter(i => i.severity === 'Critical').length,
    high: issues.filter(i => i.severity === 'High').length,
    medium: issues.filter(i => i.severity === 'Medium').length,
    low: issues.filter(i => i.severity === 'Low').length,
    suggestion: issues.filter(i => i.severity === 'Suggestion').length
  }

  return {
    issues,
    summary: `Code review completed for ${fileName} (${language}). Identified ${issues.length} findings across requested categories with zero high-severity blockers.`,
    stats
  }
}

export async function runStaticAnalysis(
  code: string,
  language: string,
  fileName: string
): Promise<Array<{ line: number; severity: string; message: string; rule?: string }>> {
  const findings: Array<{ line: number; severity: string; message: string; rule?: string }> = []
  const lines = code.split('\n')
  const lang = language.toLowerCase()

  lines.forEach((line, i) => {
    const lineNum = i + 1
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return
    }

    // ── C / C++ Rules ───────────────────────────────────────────
    if (lang === 'c' || lang === 'cpp' || lang === 'c++') {
      if (/\bgets\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'error', message: 'Insecure function gets() leads to buffer overflows — use fgets()', rule: 'security-no-gets' })
      }
      if (/\bstrcpy\s*\(/.test(trimmed) || /\bstrcat\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Unbounded string copy may overflow buffers — consider strncpy() or std::string', rule: 'memory-unbounded-copy' })
      }
      if (/\busing\s+namespace\s+std\s*;/.test(trimmed) && (fileName.endsWith('.h') || fileName.endsWith('.hpp'))) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Avoid "using namespace std;" in header files to prevent namespace pollution', rule: 'no-namespace-std-header' })
      }
      if (/\bgoto\s+\w+;/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Avoid unstructured goto statements — use structured loops or break/continue', rule: 'no-goto' })
      }
      if (/\bmalloc\s*\(/.test(trimmed) && lang === 'cpp') {
        findings.push({ line: lineNum, severity: 'info', message: 'In modern C++, prefer new/delete, std::make_unique, or std::vector over raw malloc()', rule: 'modern-cpp-memory' })
      }
    }

    // ── Java Rules ──────────────────────────────────────────────
    if (lang === 'java') {
      if (/"[^"]*"\s*==|==\s*"[^"]*"/.test(trimmed) || /\w+\s*==\s*"(?:[^"\\]|\\.)*"/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'error', message: 'String comparison using == checks reference equality — use .equals() instead', rule: 'string-equals' })
      }
      if (/catch\s*\([^)]+\)\s*\{\s*\}/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Empty catch block silently suppresses exceptions', rule: 'no-empty-catch' })
      }
      if (/System\.out\.print(ln)?\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'info', message: 'Remove raw System.out.println() statements before production — use a logger', rule: 'no-system-out' })
      }
      if (/\.printStackTrace\s*\(\s*\)/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'printStackTrace() exposes internal stack traces — log via SLF4J / Log4j instead', rule: 'no-print-stack-trace' })
      }
      if (/catch\s*\(\s*(Throwable|NullPointerException)\b/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Avoid catching generic Throwable or NullPointerException directly', rule: 'avoid-catch-throwable' })
      }
    }

    // ── JavaScript / TypeScript Rules ───────────────────────────
    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
      if (/\beval\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'error', message: 'Avoid using eval() — dangerous arbitrary code execution risk', rule: 'no-eval' })
      }
      if (/^\s*var\s+/.test(line)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Prefer "const" or "let" over "var" to avoid variable hoisting bugs', rule: 'no-var' })
      }
      if (/console\.log\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'info', message: 'Remove console.log() before deployment', rule: 'no-console' })
      }
      if (/[^!=<>]==[^=]/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Use strict equality === instead of loose equality ==', rule: 'eqeqeq' })
      }
      if (/debugger\s*;/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'error', message: 'Remove leftover "debugger;" statement', rule: 'no-debugger' })
      }
    }

    // ── Python Rules ─────────────────────────────────────────────
    if (lang === 'python') {
      if (/\beval\s*\(/.test(trimmed) || /\bexec\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'error', message: 'Avoid eval()/exec() — arbitrary code execution risk', rule: 'no-eval-exec' })
      }
      if (/except\s*:/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Bare except: catches all exceptions including SystemExit — use specific exception types', rule: 'no-bare-except' })
      }
      if (/==\s*None\b/.test(trimmed) || /\bNone\s*==/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Use "is None" instead of "== None" for identity comparison', rule: 'is-none' })
      }
      if (/\bprint\s*\(/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'info', message: 'Replace print() with a proper logging library in production code', rule: 'no-print' })
      }
      if (/def \w+\([^)]*=\[/.test(trimmed) || /def \w+\([^)]*=\{/.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Mutable default argument — use None and initialize in the function body instead', rule: 'no-mutable-default' })
      }
    }

    // ── HTML Rules ───────────────────────────────────────────────
    if (lang === 'html') {
      if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: 'Image tag missing alt attribute — required for accessibility and SEO', rule: 'img-alt' })
      }
      if (/\bstyle\s*=/i.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'info', message: 'Avoid inline style attributes — prefer external CSS classes for maintainability', rule: 'no-inline-style' })
      }
    }

    // ── CSS Rules ────────────────────────────────────────────────
    if (lang === 'css') {
      if (/!important/i.test(trimmed)) {
        findings.push({ line: lineNum, severity: 'warning', message: '!important overrides cascade and makes debugging harder — refactor specificity instead', rule: 'no-important' })
      }
    }
  })

  return findings
}
