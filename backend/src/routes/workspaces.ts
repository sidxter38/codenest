import { Router, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { authenticate, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'
import { executeCode } from '../services/execution'
import { runAIReview } from '../services/gemini'

const router = Router()


/**
 * Generate a random 4-digit code that is not currently in active conflict
 */
async function generateUnique4DigitCode(): Promise<{ code: string; numericCode: string }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000).toString()
    const code = `WS-${num}`
    const existing = await prisma.workspace.findFirst({
      where: { OR: [{ code }, { numericCode: num }] }
    })
    if (!existing) {
      return { code, numericCode: num }
    }
  }
  // Fallback with timestamp slice
  const fallbackNum = Date.now().toString().slice(-4)
  return { code: `WS-${fallbackNum}`, numericCode: fallbackNum }
}

export function workspaceWhere(input: string) {
  const raw = (input || '').trim()
  const upperRaw = raw.toUpperCase()
  const numericPart = upperRaw.replace(/\D/g, '')
  return {
    OR: [
      { id: raw },
      { code: upperRaw },
      { numericCode: upperRaw },
      ...(numericPart ? [{ numericCode: numericPart }, { code: `WS-${numericPart}` }] : [])
    ]
  }
}

// ─── GET /api/workspaces (List User's Collaborative Workspaces) ───────────────
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: req.user!.id },
          { members: { some: { userId: req.user!.id } } }
        ]
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true, avatarInitials: true } }
          }
        },
        documents: {
          select: { id: true, name: true, language: true, updatedAt: true }
        },
        owner: { select: { id: true, name: true, username: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    res.json({ workspaces })
  } catch {
    res.status(500).json({ error: 'Failed to fetch workspaces' })
  }
})

// ─── POST /api/workspaces (Create Collaborative Workspace) ───────────────────
router.post(

  '/',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Workspace name required'),
    body('language').optional().isString(),
    body('projectId').optional().isString()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const { code, numericCode } = await generateUnique4DigitCode()
      const language = (req.body.language || 'javascript').toLowerCase()

      const workspace = await prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
          data: {
            code,
            numericCode,
            name: req.body.name,
            description: req.body.description || null,
            ownerId: req.user!.id,
            projectId: req.body.projectId || null,
            language
          }
        })

        // Add owner as WorkspaceMember
        await tx.workspaceMember.create({
          data: {
            workspaceId: ws.id,
            userId: req.user!.id,
            role: 'Owner'
          }
        })

        // Seed initial collaborative files based on language
        let initialDocs: Array<{ name: string; path: string; language: string; content: string }> = []
        if (language === 'html') {
          initialDocs = [
            {
              name: 'index.html',
              path: 'index.html',
              language: 'html',
              content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simple Interactive Page</title>
    <!-- Link the CSS file -->
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <div class="card">
        <h1>Hello World!</h1>
        <p>Click the button below to change the background color.</p>
        <button id="colorBtn">Change Color</button>
    </div>

    <!-- Link the JavaScript file -->
    <script src="script.js"></script>
</body>
</html>`
            },
            {
              name: 'style.css',
              path: 'style.css',
              language: 'css',
              content: `/* Reset margins and center everything on the screen */
body {
    font-family: 'Arial', sans-serif;
    background-color: #f4f4f9;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
    transition: background-color 0.5s ease; /* Smooth transition for color changes */
}

/* Style the white container box */
.card {
    background: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
}

h1 {
    color: #333;
}

p {
    color: #666;
}

/* Style the button */
button {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    font-size: 16px;
    border-radius: 5px;
    cursor: pointer;
}

/* Button hover effect */
button:hover {
    background-color: #0056b3;
}`
            },
            {
              name: 'script.js',
              path: 'script.js',
              language: 'javascript',
              content: `// Grab the button element from the HTML
const button = document.getElementById('colorBtn');

// Add a click event listener to the button
button.addEventListener('click', () => {
    // Generate a random hex color code (e.g., #3A86FF)
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    
    // Apply the new color to the body background
    document.body.style.backgroundColor = randomColor;
});`
            }
          ]
        } else if (language === 'python') {
          initialDocs = [
            { name: 'main.py', path: 'main.py', language: 'python', content: 'print("Hello from collaborative Python workspace!")\n\ndef calculate_fibonacci(n):\n    sequence = [0, 1]\n    for i in range(2, n):\n        sequence.append(sequence[i - 1] + sequence[i - 2])\n    return sequence\n\nprint("First 10 Fibonacci numbers:", calculate_fibonacci(10))\n' }
          ]
        } else {
          initialDocs = [
            { name: 'script.js', path: 'script.js', language: 'javascript', content: 'console.log("Welcome to CodeNest Workspace!");\n' }
          ]
        }

        for (const doc of initialDocs) {
          await tx.workspaceDocument.create({
            data: {
              workspaceId: ws.id,
              name: doc.name,
              path: doc.path,
              language: doc.language,
              content: doc.content
            }
          })
        }

        return ws
      })

      res.status(201).json({
        workspace,
        code: workspace.code,
        numericCode: workspace.numericCode,
        shareMessage: `Share this workspace code with your collaborators: ${workspace.code} (or ${workspace.numericCode})`
      })
    } catch (err: unknown) {
      console.error('[Workspace] Create error:', err)
      res.status(500).json({ error: 'Failed to create collaborative workspace' })
    }
  }
)

// ─── POST /api/workspaces/join (Join by 4-digit code e.g. 4827 or WS-4827) ───
router.post(
  '/join',
  authenticate,
  [
    body('code').trim().notEmpty().withMessage('Workspace code required')
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const rawCode = req.body.code.trim()
    const upperRaw = rawCode.toUpperCase()
    const numericPart = upperRaw.replace(/\D/g, '')

    try {
      const workspace = await prisma.workspace.findFirst({
        where: {
          OR: [
            { id: rawCode },
            { code: upperRaw },
            { numericCode: upperRaw },
            ...(numericPart ? [{ numericCode: numericPart }, { code: `WS-${numericPart}` }] : [])
          ]
        },
        include: {
          members: true
        }
      })

      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found or expired.' })
        return
      }

      // Check if user is already a member
      const existingMember = workspace.members.find(m => m.userId === req.user!.id)
      if (!existingMember) {
        await prisma.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: req.user!.id,
            role: 'Collaborator'
          }
        })
      }

      res.json({
        workspaceId: workspace.id,
        code: workspace.code,
        numericCode: workspace.numericCode,
        name: workspace.name
      })
    } catch {
      res.status(500).json({ error: 'Failed to join workspace' })
    }
  }
)

// ─── GET /api/workspaces/:code (Get Workspace Details & Documents) ────────────
router.get('/:code', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code),
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true, avatarInitials: true } }
          }
        },
        documents: {
          orderBy: { name: 'asc' }
        },
        owner: { select: { id: true, name: true, username: true } }
      }
    })

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found or expired.' })
      return
    }

    res.json({ workspace })
  } catch {
    res.status(500).json({ error: 'Failed to fetch workspace' })
  }
})

// ─── PUT /api/workspaces/:code/documents/:docId (Autosave Document) ──────────
router.put('/:code/documents/:docId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const updated = await prisma.workspaceDocument.update({
      where: { id: req.params.docId },
      data: {
        content: req.body.content ?? '',
        updatedAt: new Date()
      }
    })
    res.json({ document: updated, status: 'Saved' })
  } catch {
    res.status(500).json({ error: 'Failed to save document' })
  }
})

// ─── POST /api/workspaces/:code/documents (Create Document) ──────────────────
router.post('/:code/documents', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, language, content } = req.body
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code)
    })
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' })
      return
    }

    const doc = await prisma.workspaceDocument.create({
      data: {
        workspaceId: workspace.id,
        name,
        path: name,
        language: language || 'javascript',
        content: content || ''
      }
    })
    res.status(201).json({ document: doc })
  } catch {
    res.status(500).json({ error: 'Failed to create document' })
  }
})

// ─── DELETE /api/workspaces/:code/documents/:docId ───────────────────────────
router.delete('/:code/documents/:docId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.workspaceDocument.delete({
      where: { id: req.params.docId }
    })
    res.json({ message: 'Document deleted' })
  } catch {
    res.status(500).json({ error: 'Failed to delete document' })
  }
})

// ─── Version History Routes ──────────────────────────────────────────────────
// GET /api/workspaces/:code/versions
router.get('/:code/versions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code)
    })
    if (!workspace || !workspace.projectId) {
      res.json({ versions: [] })
      return
    }

    const versions = await prisma.version.findMany({
      where: { projectId: workspace.projectId },
      orderBy: { versionNum: 'desc' },
      include: { user: { select: { name: true, avatarInitials: true } } }
    })
    res.json({ versions })
  } catch {
    res.status(500).json({ error: 'Failed to fetch versions' })
  }
})

// POST /api/workspaces/:code/versions (Snapshot Version)
router.post('/:code/versions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code),
      include: { documents: true }
    })
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' })
      return
    }

    let projId = workspace.projectId
    if (!projId) {
      const proj = await prisma.project.create({
        data: {
          name: workspace.name,
          language: workspace.language,
          ownerId: req.user!.id
        }
      })
      projId = proj.id
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { projectId: projId }
      })
    }

    const count = await prisma.version.count({ where: { projectId: projId } })
    const snapshot = JSON.stringify(workspace.documents.map(d => ({ name: d.name, content: d.content })))

    const version = await prisma.version.create({
      data: {
        projectId: projId,
        userId: req.user!.id,
        versionNum: count + 1,
        summary: req.body.summary || `Version ${count + 1}`,
        snapshot
      },
      include: { user: { select: { name: true, avatarInitials: true } } }
    })

    res.status(201).json({ version })
  } catch {
    res.status(500).json({ error: 'Failed to create version snapshot' })
  }
})

// ─── POST /api/workspaces/:code/execute (Execute Workspace Code) ──────────────

router.post('/:code/execute', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code),
      include: { documents: true }
    })

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' })
      return
    }

    const { docId, stdin } = req.body
    let targetDoc = workspace.documents.find(d => d.id === docId)
    if (!targetDoc) {
      // Find default entry file
      targetDoc = workspace.documents.find(d =>
        d.name === 'main.py' || d.name === 'script.js' || d.name === 'index.html'
      ) || workspace.documents[0]
    }

    if (!targetDoc) {
      res.status(400).json({ error: 'No documents found in workspace' })
      return
    }

    const sourceFiles = workspace.documents.map(d => ({
      name: d.name,
      content: d.content
    }))

    const result = await executeCode(targetDoc.content, targetDoc.language || workspace.language, sourceFiles, stdin)

    // Save execution record
    await prisma.execution.create({
      data: {
        userId: req.user!.id,
        language: targetDoc.language || workspace.language,
        status: result.status,
        exitCode: result.exitCode,
        executionTime: result.time,
        memoryUsed: result.memory,
        stdout: result.stdout,
        stderr: result.stderr,
        compileOutput: result.compileOutput
      }
    })

    res.json(result)
  } catch (err: unknown) {
    console.error('[Workspace Execute Error]:', (err as Error).message)
    res.status(500).json({ error: 'Workspace execution failed' })
  }
})

// ─── POST /api/workspaces/:code/ai-review (Review Workspace Code) ─────────────
router.post('/:code/ai-review', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: workspaceWhere(req.params.code),
      include: { documents: true }
    })

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' })
      return
    }

    const { docId, categories } = req.body
    let targetDoc = workspace.documents.find(d => d.id === docId)
    if (!targetDoc) {
      targetDoc = workspace.documents.find(d =>
        d.name === 'main.py' || d.name === 'script.js' || d.name === 'index.html'
      ) || workspace.documents[0]
    }

    if (!targetDoc) {
      res.status(400).json({ error: 'No documents found in workspace' })
      return
    }

    const reviewResult = await runAIReview(
      targetDoc.content,
      targetDoc.language || workspace.language,
      targetDoc.name,
      categories || ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations']
    )

    res.json(reviewResult)
  } catch (err: unknown) {
    console.error('[Workspace AI Review Error]:', (err as Error).message)
    res.status(500).json({ error: 'Workspace AI Review failed' })
  }
})

export default router

