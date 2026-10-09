import api from './api'

export interface WorkspaceDoc {
  id: string
  name: string
  path: string
  content: string
  language: string
  updatedAt: string
}

export interface WorkspaceMemberInfo {
  id: string
  role: string
  user: {
    id: string
    name: string
    username: string
    avatarInitials?: string
  }
}

export interface WorkspaceData {
  id: string
  code: string
  numericCode: string
  name: string
  description?: string
  language: string
  ownerId: string
  owner: {
    id: string
    name: string
    username: string
  }
  members: WorkspaceMemberInfo[]
  documents: WorkspaceDoc[]
}

export interface WorkspaceVersion {
  id: string
  versionNum: number
  summary: string
  snapshot: string
  createdAt: string
  user: {
    name: string
    avatarInitials?: string
  }
}

export async function createCollaborativeWorkspace(data: {
  name: string
  language?: string
  projectId?: string
}): Promise<{ workspace: WorkspaceData; code: string; numericCode: string; shareMessage: string }> {
  const response = await api.post('/workspaces', data)
  return response.data
}

export async function joinCollaborativeWorkspace(code: string): Promise<{
  workspaceId: string
  code: string
  numericCode: string
  name: string
}> {
  const response = await api.post('/workspaces/join', { code })
  return response.data
}

export async function getWorkspaceByCode(code: string): Promise<WorkspaceData> {
  const response = await api.get(`/workspaces/${code}`)
  return response.data.workspace
}

export async function saveWorkspaceDoc(
  code: string,
  docId: string,
  content: string
): Promise<{ document: WorkspaceDoc; status: string }> {
  const response = await api.put(`/workspaces/${code}/documents/${docId}`, { content })
  return response.data
}

export async function createWorkspaceDoc(
  code: string,
  data: { name: string; language?: string; content?: string }
): Promise<{ document: WorkspaceDoc }> {
  const response = await api.post(`/workspaces/${code}/documents`, data)
  return response.data
}

export async function deleteWorkspaceDoc(code: string, docId: string): Promise<{ message: string }> {
  const response = await api.delete(`/workspaces/${code}/documents/${docId}`)
  return response.data
}

export async function getWorkspaceVersions(code: string): Promise<WorkspaceVersion[]> {
  const response = await api.get(`/workspaces/${code}/versions`)
  return response.data.versions
}

export async function createWorkspaceVersionSnapshot(
  code: string,
  summary?: string
): Promise<{ version: WorkspaceVersion }> {
  const response = await api.post(`/workspaces/${code}/versions`, { summary })
  return response.data
}

export async function getUserWorkspaces(): Promise<WorkspaceData[]> {
  const response = await api.get('/workspaces')
  return response.data.workspaces
}

export async function executeWorkspaceCode(
  code: string,
  data?: { docId?: string; stdin?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number; status: string }> {
  const response = await api.post(`/workspaces/${code}/execute`, data)
  return response.data
}

export async function runWorkspaceAIReview(
  code: string,
  data?: { docId?: string; categories?: string[] }
): Promise<{ issues: any[]; summary: string; stats?: Record<string, number> }> {
  const response = await api.post(`/workspaces/${code}/ai-review`, data)
  return response.data
}


