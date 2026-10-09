/**
 * Browser-isolated JavaScript Execution Environment
 * Executes arbitrary client JS code securely inside an isolated, sandboxed iframe
 * without allow-same-origin, preventing access to the host DOM, cookies, or localStorage.
 */

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
  status: string
  time: string
  logs: Array<{ type: 'log' | 'error' | 'warn' | 'info'; message: string }>
}

export function executeJavaScriptInBrowser(code: string, timeoutMs = 5000): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const startTime = performance.now()
    const logs: Array<{ type: 'log' | 'error' | 'warn' | 'info'; message: string }> = []
    let resolved = false

    // Create an isolated sandboxed iframe
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    // sandbox without allow-same-origin ensures complete isolation
    iframe.setAttribute('sandbox', 'allow-scripts')

    const cleanup = () => {
      window.removeEventListener('message', handleMessage)
      clearTimeout(timer)
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3)
        resolve({
          stdout: logs.map(l => l.message).join('\n'),
          stderr: 'Execution timed out (5s limit exceeded).',
          exitCode: 1,
          status: 'Time Limit Exceeded',
          time: `${elapsed}s`,
          logs
        })
      }
    }, timeoutMs)

    const handleMessage = (event: MessageEvent) => {
      // Security check: only accept messages from our sandbox protocol
      if (!event.data || event.data.__codenest_sandbox !== true) return

      const payload = event.data

      if (payload.type === 'log') {
        logs.push({ type: payload.level || 'log', message: payload.content })
      } else if (payload.type === 'done') {
        if (!resolved) {
          resolved = true
          cleanup()
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(3)
          const hasErrors = logs.some(l => l.type === 'error') || payload.hasError
          resolve({
            stdout: logs.map(l => l.message).join('\n') || (hasErrors ? '' : '[Finished with 0 console logs]'),
            stderr: payload.error || (hasErrors ? logs.filter(l => l.type === 'error').map(l => l.message).join('\n') : ''),
            exitCode: hasErrors ? 1 : 0,
            status: hasErrors ? 'Runtime Error' : 'Accepted',
            time: `${elapsed}s`,
            logs
          })
        }
      }
    }

    window.addEventListener('message', handleMessage)

    // Build sandboxed runner script
    const safeRunnerHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
(function() {
  function sendLog(level, args) {
    try {
      var str = Array.prototype.slice.call(args).map(function(item) {
        if (typeof item === 'object' && item !== null) {
          try { return JSON.stringify(item, null, 2); } catch(e) { return String(item); }
        }
        return String(item);
      }).join(' ');
      parent.postMessage({ __codenest_sandbox: true, type: 'log', level: level, content: str }, '*');
    } catch(e) {}
  }

  console.log = function() { sendLog('log', arguments); };
  console.error = function() { sendLog('error', arguments); };
  console.warn = function() { sendLog('warn', arguments); };
  console.info = function() { sendLog('info', arguments); };

  window.onerror = function(msg, url, line, col, err) {
    var errorText = (err && err.stack) ? err.stack : (msg + ' (Line ' + line + ')');
    parent.postMessage({ __codenest_sandbox: true, type: 'done', hasError: true, error: String(errorText) }, '*');
    return true;
  };

  window.onunhandledrejection = function(e) {
    parent.postMessage({ __codenest_sandbox: true, type: 'done', hasError: true, error: 'Unhandled Rejection: ' + String(e.reason) }, '*');
  };

  try {
    var script = document.createElement('script');
    script.textContent = ${JSON.stringify(code)};
    document.body.appendChild(script);
    parent.postMessage({ __codenest_sandbox: true, type: 'done', hasError: false }, '*');
  } catch(err) {
    parent.postMessage({ __codenest_sandbox: true, type: 'done', hasError: true, error: String(err && err.stack ? err.stack : err) }, '*');
  }
})();
<\/script>
</body>
</html>
`

    iframe.srcdoc = safeRunnerHtml
    document.body.appendChild(iframe)
  })
}
