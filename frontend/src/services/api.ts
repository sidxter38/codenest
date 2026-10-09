import axios from 'axios'

const api = axios.create({
  baseURL:
    typeof process !== 'undefined' && process.env?.REACT_APP_API_URL
      ? process.env.REACT_APP_API_URL
      : '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
})

// Attach JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('codenest_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('codenest_token')
      localStorage.removeItem('codenest_user')
      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
