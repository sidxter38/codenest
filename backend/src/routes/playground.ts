import { Router, Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import rateLimit from 'express-rate-limit'
import { executeCode } from '../services/execution'
import { runStaticAnalysis, runAIReview } from '../services/gemini'

const router = Router()

export const playgroundLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many playground requests. Please wait a few minutes before trying again.' }
})

const MAX_CODE_LENGTH = 20000

const PLAYGROUND_LANGUAGES = ['javascript', 'python', 'html', 'css']

// POST /api/playground/execute
router.post(
  '/execute',
  [
    body('code').isString().notEmpty().withMessage('Code required'),
    body('language').isIn(PLAYGROUND_LANGUAGES).withMessage('Invalid language'),
    body('stdin').optional().isString()
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    const { code, language, stdin, files } = req.body as {
      code: string
      language: string
      stdin?: string
      files?: Array<{ name: string; content: string }>
    }

    if (code.length > MAX_CODE_LENGTH) {
      res.status(400).json({ error: `Code exceeds maximum guest limit of ${MAX_CODE_LENGTH} characters.` })
      return
    }

    // HTML/CSS cannot be "executed" via Judge0 — frontend should handle preview
    if (language === 'html' || language === 'css') {
      res.status(400).json({ error: 'HTML/CSS files use live preview, not execution. Render in an iframe on the client.' })
      return
    }

    try {
      const result = await executeCode(code, language, files, stdin)
      res.json(result)
    } catch {
      res.status(500).json({ error: 'Execution failed. Please try again.' })
    }
  }
)

// POST /api/playground/analyze
router.post(
  '/analyze',
  [
    body('code').isString().notEmpty(),
    body('language').isString().notEmpty(),
    body('fileName').isString().notEmpty()
  ],
  async (req: Request, res: Response): Promise<void> => {
    const { code, language, fileName } = req.body as { code: string; language: string; fileName: string }

    if (code.length > MAX_CODE_LENGTH) {
      res.status(400).json({ error: 'Code too long for guest analysis.' })
      return
    }

    try {
      const findings = await runStaticAnalysis(code, language, fileName)
      res.json({ findings })
    } catch {
      res.status(500).json({ error: 'Analysis failed.' })
    }
  }
)

// POST /api/playground/ai-review (Gated for authenticated users only)
router.post('/ai-review', (_req: Request, res: Response): void => {
  res.status(401).json({
    error: 'AI Code Review is available after signing in.',
    requiresAuth: true
  })
})

export default router
