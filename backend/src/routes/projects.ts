import { Router, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import crypto from 'crypto'
import { authenticate, AuthRequest } from '../middleware/auth'
import prisma from '../config/database'
import { executeCode } from '../services/execution'
import { runAIReview, runStaticAnalysis, diagnoseError } from '../services/gemini'
import { sendInvitationEmail } from '../services/email'

const router = Router()

const ALLOWED_LANGUAGES = ['HTML/CSS/JS', 'JavaScript', 'Python']
const ROLES = ['Owner', 'Developer', 'Reviewer', 'Viewer']

// Helper: verify project membership and role
async function getProjectMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  })
}

// Helper: log activity
async function logActivity(
  userId: string,
  type: string,
  summary: string,
  projectId?: string,
  data?: object
) {
  await prisma.activity.create({
    data: {
      userId,
      type,
      summary,
      projectId,
      data: data ? JSON.stringify(data) : undefined
    }
  })
}

function parseFileIds<T extends { fileIds?: unknown }>(item: T): T & { fileIds: string[] } {
  let fileIds: string[] = []
  if (Array.isArray(item.fileIds)) {
    fileIds = item.fileIds as string[]
  } else if (typeof item.fileIds === 'string') {
    try {
      fileIds = JSON.parse(item.fileIds || '[]')
    } catch {
      fileIds = []
    }
  }
  return { ...item, fileIds }
}

// ─── PROJECTS ────────────────────────────────────────────────────────────────

// GET /api/projects
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.user!.id },
      include: {
        project: {
          include: {
            members: { include: { user: { select: { name: true, avatarInitials: true } } } },
            reviews: { select: { status: true }, where: { status: { not: 'resolved' } } },
            _count: { select: { files: true, reviews: true, commits: true } }
          }
        }
      },
      orderBy: { project: { updatedAt: 'desc' } }
    })

    const projects = memberships.map(m => ({
      ...m.project,
      myRole: m.role
    }))

    res.json({ projects })
  } catch {
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// POST /api/projects
router.post(
  '/',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Project name required'),
    body('description').optional().trim().isLength({ max: 500 }),
    body('language').isIn(ALLOWED_LANGUAGES).withMessage('Invalid language')
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const project = await prisma.$transaction(async (tx) => {
        const proj = await tx.project.create({
          data: {
            name: req.body.name,
            description: req.body.description,
            language: req.body.language
          }
        })

        await tx.projectMember.create({
          data: {
            projectId: proj.id,
            userId: req.user!.id,
            role: 'Owner'
          }
        })

        if (req.body.language === 'HTML/CSS/JS') {
          await tx.projectFile.createMany({
            data: [
              {
                projectId: proj.id,
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
                projectId: proj.id,
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
                projectId: proj.id,
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
          })
        } else if (req.body.language === 'Python') {
          await tx.projectFile.create({
            data: {
              projectId: proj.id,
              name: 'main.py',
              path: 'main.py',
              language: 'python',
              content: `# CodeNest Python Workspace\n\ndef main():\n    print("Hello from CodeNest Python!")\n    numbers = [1, 2, 3, 4, 5]\n    squared = [x ** 2 for x in numbers]\n    print(f"Squared numbers: {squared}")\n\nif __name__ == "__main__":\n    main()\n`
            }
          })
        } else {
          await tx.projectFile.create({
            data: {
              projectId: proj.id,
              name: 'index.js',
              path: 'index.js',
              language: 'javascript',
              content: `// CodeNest JavaScript (Node.js) Workspace\n\nfunction calculateStats(items) {\n  const sum = items.reduce((a, b) => a + b, 0);\n  const avg = sum / items.length;\n  return { sum, avg };\n}\n\nconst data = [10, 20, 30, 40, 50];\nconsole.log('Running Node.js program:');\nconsole.log(calculateStats(data));\n`
            }
          })
        }

        return proj
      })

      await logActivity(req.user!.id, 'project_created', `Created project "${project.name}"`, project.id)

      res.status(201).json({ project })
    } catch {
      res.status(500).json({ error: 'Failed to create project' })
    }
  }
)

// GET /api/projects/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, username: true, avatarInitials: true } } }
        },
        files: { orderBy: { path: 'asc' } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: {
            creator: { select: { name: true, avatarInitials: true } },
            assignee: { select: { name: true, avatarInitials: true } },
            _count: { select: { comments: true } }
          }
        },
        commits: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { author: { select: { name: true, avatarInitials: true } } }
        },
        _count: { select: { files: true, reviews: true, commits: true } }
      }
    })

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const formattedReviews = project.reviews.map(parseFileIds)
    const formattedCommits = project.commits.map(parseFileIds)
    res.json({
      project: { ...project, reviews: formattedReviews, commits: formattedCommits },
      myRole: membership.role
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

// PATCH /api/projects/:id
router.patch(
  '/:id',
  authenticate,
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 })
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner'].includes(membership.role)) {
        res.status(403).json({ error: 'Only owners can edit project settings' })
        return
      }

      const project = await prisma.project.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.description !== undefined && { description: req.body.description })
        }
      })

      res.json({ project })
    } catch {
      res.status(500).json({ error: 'Failed to update project' })
    }
  }
)

// DELETE /api/projects/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership || membership.role !== 'Owner') {
      res.status(403).json({ error: 'Only owners can delete projects' })
      return
    }

    await prisma.project.delete({ where: { id: req.params.id } })
    res.json({ message: 'Project deleted' })
  } catch {
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

// ─── FILES ───────────────────────────────────────────────────────────────────

// GET /api/projects/:id/files
router.get('/:id/files', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const files = await prisma.projectFile.findMany({
      where: { projectId: req.params.id },
      orderBy: [{ isFolder: 'desc' }, { path: 'asc' }]
    })

    res.json({ files })
  } catch {
    res.status(500).json({ error: 'Failed to fetch files' })
  }
})

// POST /api/projects/:id/files
router.post(
  '/:id/files',
  authenticate,
  [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('File name required'),
    body('path').trim().isLength({ min: 1 }).withMessage('File path required'),
    body('content').optional().isString(),
    body('isFolder').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to create files' })
        return
      }

      const ext = req.body.name.split('.').pop()?.toLowerCase()
      const languageMap: Record<string, string> = {
        py: 'python',
        js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
        html: 'html', htm: 'html', css: 'css',
        json: 'json', md: 'markdown', txt: 'plaintext'
      }

      const file = await prisma.projectFile.create({
        data: {
          projectId: req.params.id,
          name: req.body.name,
          path: req.body.path,
          content: req.body.content || '',
          language: languageMap[ext || ''] || 'plaintext',
          isFolder: req.body.isFolder || false,
          parentPath: req.body.parentPath
        }
      })

      await logActivity(req.user!.id, 'file_created', `Created file "${req.body.path}"`, req.params.id)

      res.status(201).json({ file })
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'A file with this path already exists' })
      } else {
        res.status(500).json({ error: 'Failed to create file' })
      }
    }
  }
)

// GET /api/projects/:id/files/:fileId
router.get('/:id/files/:fileId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const file = await prisma.projectFile.findFirst({
      where: { id: req.params.fileId, projectId: req.params.id }
    })

    if (!file) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    res.json({ file })
  } catch {
    res.status(500).json({ error: 'Failed to fetch file' })
  }
})

// PATCH /api/projects/:id/files/:fileId
router.patch(
  '/:id/files/:fileId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to edit files' })
        return
      }

      const file = await prisma.projectFile.findFirst({
        where: { id: req.params.fileId, projectId: req.params.id }
      })

      if (!file) {
        res.status(404).json({ error: 'File not found' })
        return
      }

      const updated = await prisma.projectFile.update({
        where: { id: req.params.fileId },
        data: {
          ...(req.body.content !== undefined && { content: req.body.content }),
          ...(req.body.name && { name: req.body.name }),
          ...(req.body.path && { path: req.body.path })
        }
      })

      res.json({ file: updated })
    } catch {
      res.status(500).json({ error: 'Failed to update file' })
    }
  }
)

// DELETE /api/projects/:id/files/:fileId
router.delete('/:id/files/:fileId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    await prisma.projectFile.delete({ where: { id: req.params.fileId } })
    res.json({ message: 'File deleted' })
  } catch {
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

// GET /api/projects/:id/members
router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: { id: true, name: true, username: true, email: true, avatarInitials: true } } }
    })

    res.json({ members })
  } catch {
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

// PATCH /api/projects/:id/members/:userId (change role)
router.patch(
  '/:id/members/:userId',
  authenticate,
  [body('role').isIn(ROLES).withMessage('Invalid role')],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const myMembership = await getProjectMembership(req.params.id, req.user!.id)
      if (!myMembership || myMembership.role !== 'Owner') {
        res.status(403).json({ error: 'Only owners can change roles' })
        return
      }

      const updated = await prisma.projectMember.update({
        where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } },
        data: { role: req.body.role }
      })

      res.json({ member: updated })
    } catch {
      res.status(500).json({ error: 'Failed to update member role' })
    }
  }
)

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const myMembership = await getProjectMembership(req.params.id, req.user!.id)
    if (!myMembership || myMembership.role !== 'Owner') {
      res.status(403).json({ error: 'Only owners can remove members' })
      return
    }

    if (req.params.userId === req.user!.id) {
      res.status(400).json({ error: 'Cannot remove yourself' })
      return
    }

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } }
    })

    res.json({ message: 'Member removed' })
  } catch {
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

// ─── INVITATIONS ─────────────────────────────────────────────────────────────

// POST /api/projects/:id/invitations
router.post(
  '/:id/invitations',
  authenticate,
  [
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(ROLES.filter(r => r !== 'Owner')).withMessage('Invalid role')
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const myMembership = await getProjectMembership(req.params.id, req.user!.id)
      if (!myMembership || !['Owner', 'Developer'].includes(myMembership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to invite' })
        return
      }

      const project = await prisma.project.findUnique({ where: { id: req.params.id } })
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }

      // Check if already a member
      const invitedUser = await prisma.user.findUnique({ where: { email: req.body.email } })
      if (invitedUser) {
        const alreadyMember = await getProjectMembership(req.params.id, invitedUser.id)
        if (alreadyMember) {
          res.status(409).json({ error: 'This user is already a member' })
          return
        }
      }

      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      const invitation = await prisma.invitation.create({
        data: {
          projectId: req.params.id,
          invitedById: req.user!.id,
          invitedEmail: req.body.email,
          invitedUserId: invitedUser?.id,
          role: req.body.role,
          token,
          expiresAt
        }
      })

      if (invitedUser) {
        await prisma.notification.create({
          data: {
            userId: invitedUser.id,
            type: 'invitation',
            title: `Invitation to ${project.name}`,
            body: `${req.user!.name} invited you to join ${project.name}`,
            data: JSON.stringify({ invitationId: invitation.id, projectId: req.params.id })
          }
        })
      }

      await sendInvitationEmail(req.body.email, req.user!.name, project.name, token)

      res.status(201).json({ invitation: { id: invitation.id, email: invitation.invitedEmail, role: invitation.role, status: invitation.status } })
    } catch {
      res.status(500).json({ error: 'Failed to send invitation' })
    }
  }
)

// POST /api/projects/invitations/accept
router.post(
  '/invitations/accept',
  authenticate,
  [body('token').isString().notEmpty()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const invitation = await prisma.invitation.findUnique({
        where: { token: req.body.token },
        include: { project: true }
      })

      if (!invitation || invitation.status !== 'pending') {
        res.status(400).json({ error: 'Invalid or expired invitation' })
        return
      }

      if (invitation.expiresAt < new Date()) {
        await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'expired' } })
        res.status(400).json({ error: 'Invitation has expired' })
        return
      }

      if (invitation.invitedEmail !== req.user!.email) {
        res.status(403).json({ error: 'This invitation was sent to a different email' })
        return
      }

      await prisma.$transaction([
        prisma.projectMember.create({
          data: { projectId: invitation.projectId, userId: req.user!.id, role: invitation.role }
        }),
        prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'accepted' } })
      ])

      await logActivity(req.user!.id, 'member_invited', `Joined project "${invitation.project.name}"`, invitation.projectId)

      res.json({ projectId: invitation.projectId, projectName: invitation.project.name })
    } catch (err: unknown) {
      const error = err as { code?: string }
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'You are already a member of this project' })
      } else {
        res.status(500).json({ error: 'Failed to accept invitation' })
      }
    }
  }
)

// ─── CODE EXECUTION ───────────────────────────────────────────────────────────

// POST /api/projects/:id/execute
router.post(
  '/:id/execute',
  authenticate,
  [
    body('code').isString().notEmpty().withMessage('Code required'),
    body('language').isIn(['javascript', 'python', 'html', 'css', 'typescript', 'js', 'py']).withMessage('Invalid language'),
    body('stdin').optional().isString()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to run code' })
        return
      }

      const result = await executeCode(req.body.code, req.body.language, undefined, req.body.stdin)
      res.json(result)
    } catch {
      res.status(500).json({ error: 'Execution failed' })
    }
  }
)

// ─── STATIC ANALYSIS ─────────────────────────────────────────────────────────

// POST /api/projects/:id/analyze
router.post(
  '/:id/analyze',
  authenticate,
  [
    body('code').isString().notEmpty(),
    body('language').isString().notEmpty(),
    body('fileName').isString().notEmpty()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      const findings = await runStaticAnalysis(req.body.code, req.body.language, req.body.fileName)
      res.json({ findings })
    } catch {
      res.status(500).json({ error: 'Analysis failed' })
    }
  }
)

// ─── AI REVIEW ───────────────────────────────────────────────────────────────

// POST /api/projects/:id/ai-review
router.post(
  '/:id/ai-review',
  authenticate,
  [
    body('code').isString().notEmpty().withMessage('Code required'),
    body('language').isString().notEmpty(),
    body('fileName').isString().notEmpty(),
    body('categories').isArray({ min: 1 }).withMessage('At least one category required'),
    body('reviewId').isString().notEmpty()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      const validCategories = ['bug', 'security', 'performance', 'maintainability', 'readability', 'code_quality']
      const categories = (req.body.categories as string[]).filter(c => validCategories.includes(c))

      if (categories.length === 0) {
        res.status(400).json({ error: 'No valid categories provided' })
        return
      }

      const result = await runAIReview(req.body.code, req.body.language, req.body.fileName, categories)

      // Save findings
      const savedFindings = await Promise.all(
        result.issues.map(issue =>
          prisma.aIFinding.create({
            data: {
              reviewId: req.body.reviewId,
              requestedBy: req.user!.id,
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              category: issue.category,
              title: issue.title,
              description: issue.description,
              suggestion: issue.suggestion
            }
          })
        )
      )

      res.json({ findings: savedFindings, summary: result.summary })
    } catch {
      res.status(500).json({ error: 'AI review failed' })
    }
  }
)

// POST /api/projects/:id/ai-diagnose-error (Low-token targeted error diagnosis)
router.post(
  '/:id/ai-diagnose-error',
  authenticate,
  [
    body('code').isString().notEmpty().withMessage('Code required'),
    body('language').isString().notEmpty(),
    body('errorOutput').isString().notEmpty(),
    body('fileName').optional().isString()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      const result = await diagnoseError(
        req.body.code,
        req.body.language,
        req.body.errorOutput,
        req.body.fileName || 'main.py'
      )
      res.json(result)
    } catch {
      res.status(500).json({ error: 'AI error diagnosis failed' })
    }
  }
)

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

// GET /api/projects/:id/reviews
router.get('/:id/reviews', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const reviews = await prisma.review.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { name: true, avatarInitials: true } },
        assignee: { select: { name: true, avatarInitials: true } },
        _count: { select: { comments: true, aiFindings: true } }
      }
    })

    res.json({ reviews: reviews.map(parseFileIds) })
  } catch {
    res.status(500).json({ error: 'Failed to fetch reviews' })
  }
})

// POST /api/projects/:id/reviews
router.post(
  '/:id/reviews',
  authenticate,
  [
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Review title required'),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('assigneeId').optional().isString(),
    body('fileIds').optional().isArray()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to create reviews' })
        return
      }

      const review = await prisma.review.create({
        data: {
          projectId: req.params.id,
          creatorId: req.user!.id,
          title: req.body.title,
          description: req.body.description,
          assigneeId: req.body.assigneeId,
          fileIds: JSON.stringify(req.body.fileIds || []),
          status: req.body.assigneeId ? 'requested' : 'draft'
        },
        include: {
          creator: { select: { name: true, avatarInitials: true } },
          assignee: { select: { name: true, avatarInitials: true } }
        }
      })

      if (review.assigneeId) {
        await prisma.notification.create({
          data: {
            userId: review.assigneeId,
            type: 'review_requested',
            title: 'Review requested',
            body: `${req.user!.name} requested your review on "${review.title}"`,
            data: JSON.stringify({ reviewId: review.id, projectId: req.params.id })
          }
        })
      }

      await logActivity(req.user!.id, 'review_created', `Created review "${review.title}"`, req.params.id)

      res.status(201).json({ review: parseFileIds(review) })
    } catch {
      res.status(500).json({ error: 'Failed to create review' })
    }
  }
)

// GET /api/projects/:id/reviews/:reviewId
router.get(
  '/:id/reviews/:reviewId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      const review = await prisma.review.findFirst({
        where: { id: req.params.reviewId, projectId: req.params.id },
        include: {
          creator: { select: { name: true, username: true, avatarInitials: true } },
          assignee: { select: { name: true, username: true, avatarInitials: true } },
          comments: {
            orderBy: { createdAt: 'asc' },
            include: {
              author: { select: { name: true, avatarInitials: true } },
              replies: {
                include: { author: { select: { name: true, avatarInitials: true } } }
              }
            },
            where: { parentId: null }
          },
          aiFindings: { orderBy: { severity: 'asc' } }
        }
      })

      if (!review) {
        res.status(404).json({ error: 'Review not found' })
        return
      }

      res.json({ review: parseFileIds(review) })
    } catch {
      res.status(500).json({ error: 'Failed to fetch review' })
    }
  }
)

// PATCH /api/projects/:id/reviews/:reviewId
router.patch(
  '/:id/reviews/:reviewId',
  authenticate,
  [body('status').optional().isString()],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer', 'Reviewer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }

      const validStatuses = ['draft', 'requested', 'in_review', 'changes_requested', 'approved', 'resolved']
      if (req.body.status && !validStatuses.includes(req.body.status)) {
        res.status(400).json({ error: 'Invalid status' })
        return
      }

      const review = await prisma.review.update({
        where: { id: req.params.reviewId },
        data: {
          ...(req.body.status && { status: req.body.status }),
          ...(req.body.title && { title: req.body.title }),
          ...(req.body.description !== undefined && { description: req.body.description })
        }
      })

      // Send notification on approval/changes requested
      if (req.body.status === 'approved' || req.body.status === 'changes_requested') {
        const fullReview = await prisma.review.findUnique({ where: { id: req.params.reviewId } })
        if (fullReview?.creatorId) {
          await prisma.notification.create({
            data: {
              userId: fullReview.creatorId,
              type: req.body.status === 'approved' ? 'review_approved' : 'changes_requested',
              title: req.body.status === 'approved' ? 'Review approved' : 'Changes requested',
              body: `${req.user!.name} ${req.body.status === 'approved' ? 'approved' : 'requested changes on'} "${fullReview.title}"`,
              data: JSON.stringify({ reviewId: review.id, projectId: req.params.id })
            }
          })
        }
      }

      res.json({ review })
    } catch {
      res.status(500).json({ error: 'Failed to update review' })
    }
  }
)

// ─── REVIEW COMMENTS ─────────────────────────────────────────────────────────

// GET /api/projects/:id/comments
router.get('/:id/comments', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const { reviewId } = req.query
    const comments = await prisma.reviewComment.findMany({
      where: {
        review: { projectId: req.params.id },
        ...(reviewId && { reviewId: String(reviewId) }),
        parentId: null
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { name: true, avatarInitials: true } },
        file: { select: { name: true, path: true } },
        replies: {
          include: { author: { select: { name: true, avatarInitials: true } } },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    res.json({ comments })
  } catch {
    res.status(500).json({ error: 'Failed to fetch comments' })
  }
})

// POST /api/projects/:id/comments
router.post(
  '/:id/comments',
  authenticate,
  [
    body('reviewId').isString().notEmpty(),
    body('body').trim().isLength({ min: 1, max: 5000 }).withMessage('Comment body required'),
    body('fileId').optional().isString(),
    body('line').optional().isInt({ min: 1 }),
    body('parentId').optional().isString()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer', 'Reviewer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions to comment' })
        return
      }

      const comment = await prisma.reviewComment.create({
        data: {
          reviewId: req.body.reviewId,
          authorId: req.user!.id,
          body: req.body.body,
          fileId: req.body.fileId,
          line: req.body.line,
          parentId: req.body.parentId
        },
        include: {
          author: { select: { name: true, avatarInitials: true } }
        }
      })

      await logActivity(req.user!.id, 'comment_added', `Commented on review`, req.params.id)

      res.status(201).json({ comment })
    } catch {
      res.status(500).json({ error: 'Failed to add comment' })
    }
  }
)

// PATCH /api/projects/:id/comments/:commentId
router.patch(
  '/:id/comments/:commentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const comment = await prisma.reviewComment.findUnique({ where: { id: req.params.commentId } })
      if (!comment) {
        res.status(404).json({ error: 'Comment not found' })
        return
      }

      // Only author can edit body; reviewers/owners can resolve
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member' })
        return
      }

      const canResolve = ['Owner', 'Developer', 'Reviewer'].includes(membership.role)
      const isAuthor = comment.authorId === req.user!.id

      if (req.body.body !== undefined && !isAuthor) {
        res.status(403).json({ error: 'Only the author can edit comment text' })
        return
      }

      if (req.body.resolved !== undefined && !canResolve) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }

      const updated = await prisma.reviewComment.update({
        where: { id: req.params.commentId },
        data: {
          ...(req.body.body !== undefined && { body: req.body.body }),
          ...(req.body.resolved !== undefined && { resolved: req.body.resolved })
        }
      })

      res.json({ comment: updated })
    } catch {
      res.status(500).json({ error: 'Failed to update comment' })
    }
  }
)

// ─── COMMITS ─────────────────────────────────────────────────────────────────

// GET /api/projects/:id/commits
router.get('/:id/commits', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member' })
      return
    }

    const commits = await prisma.commit.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { author: { select: { name: true, avatarInitials: true } } }
    })

    res.json({ commits: commits.map(parseFileIds) })
  } catch {
    res.status(500).json({ error: 'Failed to fetch commits' })
  }
})

// POST /api/projects/:id/commits
router.post(
  '/:id/commits',
  authenticate,
  [
    body('message').trim().isLength({ min: 1, max: 500 }).withMessage('Commit message required'),
    body('fileIds').optional().isArray()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership || !['Owner', 'Developer'].includes(membership.role)) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }

      const commit = await prisma.commit.create({
        data: {
          projectId: req.params.id,
          authorId: req.user!.id,
          message: req.body.message,
          fileIds: JSON.stringify(req.body.fileIds || [])
        },
        include: { author: { select: { name: true, avatarInitials: true } } }
      })

      await logActivity(req.user!.id, 'commit_created', `Committed: "${req.body.message}"`, req.params.id)

      res.status(201).json({ commit: parseFileIds(commit) })
    } catch {
      res.status(500).json({ error: 'Failed to create commit' })
    }
  }
)

// ─── ACTIVITY ────────────────────────────────────────────────────────────────

// GET /api/projects/:id/activity
router.get('/:id/activity', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const membership = await getProjectMembership(req.params.id, req.user!.id)
    if (!membership) {
      res.status(403).json({ error: 'Not a member' })
      return
    }

    const activities = await prisma.activity.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true, avatarInitials: true } } }
    })

    res.json({ activities })
  } catch {
    res.status(500).json({ error: 'Failed to fetch activity' })
  }
})

// ─── AI CODE REVIEW & EXECUTION ──────────────────────────────────────────────

// POST /api/projects/ai-direct-review (Direct AI review for authenticated users)
router.post(
  '/ai-direct-review',
  authenticate,
  [
    body('code').isString().withMessage('Code string is required'),
    body('language').isString().withMessage('Language is required'),
    body('fileName').optional().isString(),
    body('categories').optional().isArray()
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() })
      return
    }

    try {
      const { code, language, fileName, categories } = req.body
      const result = await runAIReview(
        code,
        language,
        fileName || `main.${language === 'python' ? 'py' : 'js'}`,
        categories || ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations']
      )

      res.json(result)
    } catch (err: unknown) {
      console.error('[AI Direct Review Error]:', (err as Error).message)
      res.status(500).json({ error: 'AI Code Review failed. Please try again.' })
    }
  }
)

// POST /api/projects/:id/ai-review (Review a project file or review draft)
router.post(
  '/:id/ai-review',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      let { code, language, fileName, categories, reviewId, fileId } = req.body

      // If fileId provided without code, fetch file content
      if (fileId && !code) {
        const file = await prisma.projectFile.findUnique({ where: { id: fileId } })
        if (file) {
          code = file.content
          language = file.language || language
          fileName = file.name
        }
      }

      if (!code) {
        res.status(400).json({ error: 'Code content or valid fileId required' })
        return
      }

      const result = await runAIReview(
        code,
        language || 'javascript',
        fileName || 'source',
        categories || ['Bugs', 'Security', 'Performance', 'Code Quality', 'Recommendations']
      )

      // If reviewId is supplied, persist findings
      if (reviewId) {
        const review = await prisma.review.findUnique({ where: { id: reviewId } })
        if (review) {
          await prisma.aIFinding.createMany({
            data: result.issues.map(issue => ({
              reviewId,
              requestedBy: req.user!.id,
              file: issue.file,
              line: issue.line ?? null,
              severity: issue.severity,
              category: issue.category,
              title: issue.title,
              description: issue.description,
              suggestion: issue.suggestion ?? null
            }))
          })
        }
      }

      await logActivity(req.user!.id, 'ai_review_requested', `Ran AI Code Review on ${fileName || 'project code'}`, req.params.id)

      res.json({
        findings: result.issues,
        issues: result.issues,
        summary: result.summary,
        stats: result.stats
      })
    } catch (err: unknown) {
      console.error('[Project AI Review Error]:', (err as Error).message)
      res.status(500).json({ error: 'Project AI review failed' })
    }
  }
)

// POST /api/projects/:id/execute (Execute code in Docker container sandbox)
router.post(
  '/:id/execute',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const membership = await getProjectMembership(req.params.id, req.user!.id)
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this project' })
        return
      }

      const project = await prisma.project.findUnique({
        where: { id: req.params.id },
        include: { files: true }
      })

      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }

      let { code, language, fileId, stdin } = req.body
      language = language || project.language

      const sourceFiles = (project.files || []).map(f => ({
        name: f.name,
        content: f.content
      }))

      if (!code && fileId) {
        const targetFile = project.files.find(f => f.id === fileId)
        if (targetFile) code = targetFile.content
      }

      if (!code && sourceFiles.length > 0) {
        // Find entry file
        const entry = sourceFiles.find(f =>
          f.name === 'main.py' || f.name === 'index.js' || f.name === 'index.html'
        ) || sourceFiles[0]
        code = entry.content
      }

      if (!code) {
        res.status(400).json({ error: 'No executable code found in project' })
        return
      }

      const result = await executeCode(code, language, sourceFiles, stdin)

      // Record execution
      await prisma.execution.create({
        data: {
          userId: req.user!.id,
          language,
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
      console.error('[Project Execution Error]:', (err as Error).message)
      res.status(500).json({ error: 'Project code execution failed' })
    }
  }
)

// POST /api/projects/:id/static-analysis
router.post(
  '/:id/static-analysis',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { code, language, fileName } = req.body
      if (!code) {
        res.status(400).json({ error: 'Code is required' })
        return
      }
      const findings = await runStaticAnalysis(code, language || 'javascript', fileName || 'source')
      res.json({ findings })
    } catch {
      res.status(500).json({ error: 'Static analysis failed' })
    }
  }
)

export default router

