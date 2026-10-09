import api from './api'

export interface Project {
  id: string
  name: string
  description?: string
  language: string
  visibility: string
  createdAt: string
  updatedAt: string
  myRole?: string
  members?: ProjectMember[]
  files?: ProjectFile[]
  reviews?: Review[]
  commits?: Commit[]
  _count?: { files: number; reviews: number; commits: number }
}

export interface ProjectMember {
  id: string
  role: string
  joinedAt: string
  user: { id: string; name: string; username: string; avatarInitials: string }
}

export interface ProjectFile {
  id: string
  name: string
  path: string
  content: string
  language: string
  isFolder: boolean
  parentPath?: string
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  title: string
  description?: string
  status: string
  creatorId: string
  assigneeId?: string
  fileIds: string[]
  createdAt: string
  updatedAt: string
  creator?: { name: string; avatarInitials: string }
  assignee?: { name: string; avatarInitials: string }
  _count?: { comments: number; aiFindings: number }
}

export interface ReviewComment {
  id: string
  body: string
  line?: number
  resolved: boolean
  createdAt: string
  authorId: string
  author: { name: string; avatarInitials: string }
  file?: { name: string; path: string }
  replies?: ReviewComment[]
}

export interface AIFinding {
  id?: string
  file: string
  line?: number
  severity: string
  category: string
  title: string
  description: string
  suggestion?: string
  currentCode?: string
  suggestedCode?: string
  dismissed?: boolean
  createdAt?: string
}

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

export interface Commit {
  id: string
  message: string
  fileIds: string[]
  createdAt: string
  author: { name: string; avatarInitials: string }
}

// ─── Execution & Direct AI ───────────────────────────────────────────────────

export async function executeProject(
  projectId: string,
  data?: { fileId?: string; stdin?: string; code?: string; language?: string }
): Promise<ExecutionResult> {
  const response = await api.post(`/projects/${projectId}/execute`, data)
  return response.data
}

export async function runDirectAIReview(data: {
  code: string
  language: string
  fileName?: string
  categories?: string[]
}): Promise<{ issues: AIFinding[]; summary: string; stats?: Record<string, number> }> {
  const response = await api.post('/projects/ai-direct-review', data)
  return response.data
}


// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const response = await api.get('/projects')
  return response.data.projects
}

export async function createProject(data: {
  name: string
  description?: string
  language: string
}): Promise<Project> {
  const response = await api.post('/projects', data)
  return response.data.project
}

export async function getProject(id: string): Promise<{ project: Project; myRole: string }> {
  const response = await api.get(`/projects/${id}`)
  return response.data
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  const response = await api.patch(`/projects/${id}`, data)
  return response.data.project
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`)
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function getFiles(projectId: string): Promise<ProjectFile[]> {
  const response = await api.get(`/projects/${projectId}/files`)
  return response.data.files
}

export async function createFile(
  projectId: string,
  data: { name: string; path: string; content?: string; isFolder?: boolean; parentPath?: string }
): Promise<ProjectFile> {
  const response = await api.post(`/projects/${projectId}/files`, data)
  return response.data.file
}

export async function getFile(projectId: string, fileId: string): Promise<ProjectFile> {
  const response = await api.get(`/projects/${projectId}/files/${fileId}`)
  return response.data.file
}

export async function updateFile(
  projectId: string,
  fileId: string,
  data: { content?: string; name?: string; path?: string }
): Promise<ProjectFile> {
  const response = await api.patch(`/projects/${projectId}/files/${fileId}`, data)
  return response.data.file
}

export async function deleteFile(projectId: string, fileId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/files/${fileId}`)
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMembers(projectId: string): Promise<ProjectMember[]> {
  const response = await api.get(`/projects/${projectId}/members`)
  return response.data.members
}

export async function inviteMember(
  projectId: string,
  data: { email: string; role: string }
): Promise<void> {
  await api.post(`/projects/${projectId}/invitations`, data)
}

export async function acceptInvitation(token: string): Promise<{ projectId: string; projectName: string }> {
  const response = await api.post('/projects/invitations/accept', { token })
  return response.data
}

// ─── Execution ────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  status: string
  time?: string
  memory?: string
  compileOutput?: string
}

export async function executeCode(
  projectId: string,
  data: { code: string; language: string; stdin?: string }
): Promise<ExecutionResult> {
  const response = await api.post(`/projects/${projectId}/execute`, data)
  return response.data
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export async function analyzeCode(
  projectId: string,
  data: { code: string; language: string; fileName: string }
): Promise<Array<{ line: number; severity: string; message: string; rule?: string }>> {
  const response = await api.post(`/projects/${projectId}/analyze`, data)
  return response.data.findings
}

// ─── AI Review ────────────────────────────────────────────────────────────────

export async function runAIReview(
  projectId: string,
  data: { code: string; language: string; fileName: string; categories: string[]; reviewId: string }
): Promise<{ findings: AIFinding[]; summary: string }> {
  const response = await api.post(`/projects/${projectId}/ai-review`, data)
  return response.data
}

export interface AIDiagnosis {
  errorSummary: string
  approach: string
  fixedCode?: string
  line?: number
}

export async function diagnoseProjectError(
  projectId: string,
  data: { code: string; language: string; errorOutput: string; fileName?: string }
): Promise<AIDiagnosis> {
  const response = await api.post(`/projects/${projectId}/ai-diagnose-error`, data)
  return response.data
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function getReviews(projectId: string): Promise<Review[]> {
  const response = await api.get(`/projects/${projectId}/reviews`)
  return response.data.reviews
}

export async function createReview(
  projectId: string,
  data: { title: string; description?: string; assigneeId?: string; fileIds?: string[] }
): Promise<Review> {
  const response = await api.post(`/projects/${projectId}/reviews`, data)
  return response.data.review
}

export async function getReview(projectId: string, reviewId: string): Promise<Review> {
  const response = await api.get(`/projects/${projectId}/reviews/${reviewId}`)
  return response.data.review
}

export async function updateReview(
  projectId: string,
  reviewId: string,
  data: { status?: string; title?: string; description?: string }
): Promise<Review> {
  const response = await api.patch(`/projects/${projectId}/reviews/${reviewId}`, data)
  return response.data.review
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(projectId: string, reviewId?: string): Promise<ReviewComment[]> {
  const response = await api.get(`/projects/${projectId}/comments`, {
    params: reviewId ? { reviewId } : undefined
  })
  return response.data.comments
}

export async function addComment(
  projectId: string,
  data: { reviewId: string; body: string; fileId?: string; line?: number; parentId?: string }
): Promise<ReviewComment> {
  const response = await api.post(`/projects/${projectId}/comments`, data)
  return response.data.comment
}

export async function resolveComment(
  projectId: string,
  commentId: string,
  resolved: boolean
): Promise<ReviewComment> {
  const response = await api.patch(`/projects/${projectId}/comments/${commentId}`, { resolved })
  return response.data.comment
}

// ─── Commits ──────────────────────────────────────────────────────────────────

export async function getCommits(projectId: string): Promise<Commit[]> {
  const response = await api.get(`/projects/${projectId}/commits`)
  return response.data.commits
}

export async function createCommit(
  projectId: string,
  data: { message: string; fileIds?: string[] }
): Promise<Commit> {
  const response = await api.post(`/projects/${projectId}/commits`, data)
  return response.data.commit
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export async function getProjectActivity(projectId: string) {
  const response = await api.get(`/projects/${projectId}/activity`)
  return response.data.activities
}
