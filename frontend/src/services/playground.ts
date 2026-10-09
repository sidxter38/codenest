import api from './api'
import { ExecutionResult } from './projects'

export type PlaygroundLang = 'html' | 'javascript' | 'python'

export interface PlaygroundFile {
  name: string
  language: string
  content: string
}

export const PLAYGROUND_LANGUAGES: Array<{ id: PlaygroundLang; label: string; icon: string }> = [
  { id: 'html', label: 'HTML / CSS / JS', icon: 'Globe' },
  { id: 'javascript', label: 'JavaScript (Node)', icon: 'Code2' },
  { id: 'python', label: 'Python', icon: 'Terminal' }
]

export const DEFAULT_PROJECT_FILES: Record<PlaygroundLang, PlaygroundFile[]> = {
    html: [
    {
      name: 'index.html',
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
  ],

  javascript: [
    {
      name: 'script.js',
      language: 'javascript',
      content: `// Standalone JavaScript Runner
// Executes securely in isolated sandbox

function calculateFibonacci(n) {
  const sequence = [0, 1];
  for (let i = 2; i < n; i++) {
    sequence.push(sequence[i - 1] + sequence[i - 2]);
  }
  return sequence;
}

const count = 12;
const fib = calculateFibonacci(count);

console.log(\`First \${count} Fibonacci numbers:\`, fib);
console.log("Sum:", fib.reduce((a, b) => a + b, 0));
`
    }
  ],

  python: [
    {
      name: 'main.py',
      language: 'python',
      content: `# Standalone Python Runner
# Executes securely in isolated sandbox

def calculate_fibonacci(n):
    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i - 1] + sequence[i - 2])
    return sequence

count = 12
fib = calculate_fibonacci(count)

print(f"First {count} Fibonacci numbers: {fib}")
print(f"Sum: {sum(fib)}")
`
    }
  ]
}

/**
 * Sanitizes terminal output in the frontend:
 * - Normalizes CRLF to LF
 * - Strips ANSI escape sequences
 * - Strips orphaned ANSI codes like [33m, [39m
 */
export function cleanTerminalOutput(str: string | undefined): string {
  if (!str) return ''
  return str
    .replace(/\r\n/g, '\n')
    // Standard ANSI CSI escape codes
    // eslint-disable-next-line no-control-regex
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    // Standard ANSI OSC escape codes
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\][^\x07\x1B]*(\x07|\x1B\\)/g, '')
    // Orphaned ANSI codes where ESC character was dropped
    .replace(/\[\d{1,3}(?:;\d{1,3})*m/g, '')
    // Non-printable control characters except \n, \t
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export async function playgroundExecute(data: {
  code: string
  language: string
  files?: Array<{ name: string; content: string }>
  stdin?: string
}): Promise<ExecutionResult> {
  const response = await api.post('/playground/execute', data)
  return response.data
}

export async function playgroundAnalyze(data: {
  code: string
  language: string
  fileName: string
}): Promise<Array<{ line: number; severity: string; message: string; rule?: string }>> {
  const response = await api.post('/playground/analyze', data)
  return response.data.findings
}
