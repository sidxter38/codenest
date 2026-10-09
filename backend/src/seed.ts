import dotenv from 'dotenv'
import path from 'path'
dotenv.config()
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting CodeNest database seeding...')

  // 1. Clean existing records in reverse dependency order
  console.log('🧹 Cleaning existing data...')
  await prisma.activity.deleteMany().catch(() => {})
  await prisma.notification.deleteMany().catch(() => {})
  await prisma.aIFinding.deleteMany().catch(() => {})
  await prisma.reviewComment.deleteMany().catch(() => {})
  await prisma.review.deleteMany().catch(() => {})
  await prisma.fileVersion.deleteMany().catch(() => {})
  await prisma.commit.deleteMany().catch(() => {})
  await prisma.projectFile.deleteMany().catch(() => {})
  await prisma.invitation.deleteMany().catch(() => {})
  await prisma.projectMember.deleteMany().catch(() => {})
  await prisma.project.deleteMany().catch(() => {})
  await prisma.session.deleteMany().catch(() => {})
  await prisma.verificationToken.deleteMany().catch(() => {})
  await prisma.passwordReset.deleteMany().catch(() => {})
  await prisma.user.deleteMany().catch(() => {})

  // 2. Create Users
  console.log('👤 Creating users...')
  const passwordHash = await bcrypt.hash('password123', 10)

  const userAlex = await prisma.user.create({
    data: {
      name: 'Alex Rivera',
      username: 'alexdev',
      email: 'demo@codenest.dev',
      passwordHash,
      emailVerified: true,
      avatarInitials: 'AR'
    }
  })

  const userSarah = await prisma.user.create({
    data: {
      name: 'Sarah Chen',
      username: 'sarahc',
      email: 'sarah@codenest.dev',
      passwordHash,
      emailVerified: true,
      avatarInitials: 'SC'
    }
  })

  const userMarcus = await prisma.user.create({
    data: {
      name: 'Marcus Vance',
      username: 'marcusv',
      email: 'marcus@codenest.dev',
      passwordHash,
      emailVerified: true,
      avatarInitials: 'MV'
    }
  })

  console.log(`✅ Users created: ${userAlex.email}, ${userSarah.email}, ${userMarcus.email}`)

  // 3. Project 1: Distributed Cache & Rate Limiter (TypeScript)
  console.log('📁 Creating Project 1: Distributed Cache & Rate Limiter...')
  const projCache = await prisma.project.create({
    data: {
      name: 'distributed-rate-limiter',
      description: 'High-throughput token bucket rate limiter and in-memory LRU cache service with clustering support.',
      language: 'JavaScript',
      visibility: 'private',
      members: {
        create: [
          { userId: userAlex.id, role: 'Owner' },
          { userId: userSarah.id, role: 'Developer' },
          { userId: userMarcus.id, role: 'Reviewer' }
        ]
      }
    }
  })

  // Create Files for Project 1
  const fileLimiterCode = `// Token Bucket Rate Limiter
// Designed for high-frequency API endpoints

export interface LimiterOptions {
  capacity: number
  refillRate: number // tokens per second
}

export class TokenBucketLimiter {
  private capacity: number
  private refillRate: number
  private tokens: number
  private lastRefillTimestamp: number
  // Potential memory issue: clients map never gets pruned
  private clientBuckets: Map<string, { tokens: number; lastRefill: number }> = new Map()

  constructor(options: LimiterOptions) {
    this.capacity = options.capacity
    this.refillRate = options.refillRate
    this.tokens = options.capacity
    this.lastRefillTimestamp = Date.now()
  }

  public allowRequest(clientId: string, cost: number = 1): boolean {
    const now = Date.now()
    let bucket = this.clientBuckets.get(clientId)

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now }
      this.clientBuckets.set(clientId, bucket)
    }

    // Refill tokens based on elapsed time
    const elapsedSeconds = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillRate)
    bucket.lastRefill = now

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost
      return true
    }

    return false
  }

  public getRemainingTokens(clientId: string): number {
    const bucket = this.clientBuckets.get(clientId)
    return bucket ? Math.floor(bucket.tokens) : this.capacity
  }
}
`

  const fileCacheCode = `// In-Memory Least Recently Used (LRU) Cache
export class LRUCache<K, V> {
  private capacity: number
  private cache: Map<K, V>

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than zero')
    }
    this.capacity = capacity
    this.cache = new Map<K, V>()
  }

  public get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined
    }
    // Refresh position for LRU semantics
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  public put(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.capacity) {
      // Evict oldest item (first key in insertion order)
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, value)
  }

  public size(): number {
    return this.cache.size
  }

  public clear(): void {
    this.cache.clear()
  }
}
`

  const fileReadme = `# Distributed Rate Limiter & LRU Cache

Welcome to CodeNest project workspace!

## Features
- **Token Bucket Limiter**: Smooth burst traffic management.
- **LRU Cache**: Constant time key-value caching with memory bounded eviction.
- **Real-time collaboration**: Multiple engineers can edit and review concurrently.

## Run Benchmarks
Click the **Run** button above or execute the suite in the terminal.
`

  const file1 = await prisma.projectFile.create({
    data: {
      projectId: projCache.id,
      name: 'limiter.ts',
      path: 'src/limiter.ts',
      content: fileLimiterCode,
      language: 'javascript'
    }
  })

  const file2 = await prisma.projectFile.create({
    data: {
      projectId: projCache.id,
      name: 'cache.ts',
      path: 'src/cache.ts',
      content: fileCacheCode,
      language: 'javascript'
    }
  })

  const file3 = await prisma.projectFile.create({
    data: {
      projectId: projCache.id,
      name: 'README.md',
      path: 'README.md',
      content: fileReadme,
      language: 'markdown'
    }
  })

  // Review 1 on Project 1
  const review1 = await prisma.review.create({
    data: {
      projectId: projCache.id,
      creatorId: userAlex.id,
      assigneeId: userSarah.id,
      title: 'PR #104: Production Token Bucket and LRU Cache Architecture Review',
      description: 'Please review the sliding window implementation and concurrency handling before we deploy to production staging.',
      status: 'in_review',
      fileIds: JSON.stringify([file1.id, file2.id])
    }
  })

  // Comments on Review 1
  const comment1 = await prisma.reviewComment.create({
    data: {
      reviewId: review1.id,
      authorId: userSarah.id,
      fileId: file1.id,
      line: 14,
      body: 'The `clientBuckets` Map stores client state indefinitely. If we have 100k distinct clients daily, this will lead to unbounded heap memory growth. We should add TTL cleanup or an eviction policy.'
    }
  })

  await prisma.reviewComment.create({
    data: {
      reviewId: review1.id,
      authorId: userAlex.id,
      parentId: comment1.id,
      body: 'Excellent catch Sarah! I will implement an active periodic sweep using a timer that purges clients inactive for over 1 hour.'
    }
  })

  await prisma.reviewComment.create({
    data: {
      reviewId: review1.id,
      authorId: userMarcus.id,
      fileId: file2.id,
      line: 33,
      body: 'Using `this.cache.keys().next().value` relies on JS Map insertion order. It works great in V8, but for multi-million keys consider a doubly linked list to prevent generator object allocations during peak load.'
    }
  })

  // AI Quality Findings for Review 1
  await prisma.aIFinding.createMany({
    data: [
      {
        reviewId: review1.id,
        requestedBy: userAlex.id,
        file: 'src/limiter.ts',
        line: 14,
        severity: 'high',
        category: 'performance',
        title: 'Unbounded In-Memory Map Allocation',
        description: 'The `clientBuckets` Map grows linearly with each unique `clientId` and does not provide an eviction or expiration strategy, presenting a memory exhaustion vulnerability.',
        suggestion: 'Introduce a Maximum Memory Limit or sweep expired entries when `lastRefill` is older than a configured threshold.'
      },
      {
        reviewId: review1.id,
        requestedBy: userAlex.id,
        file: 'src/limiter.ts',
        line: 30,
        severity: 'medium',
        category: 'code_quality',
        title: 'Floating Point Precision In Token Accumulation',
        description: 'Calculation of `elapsedSeconds * this.refillRate` may accumulate floating point errors over long timeframes, potentially causing token drift.',
        suggestion: 'Calculate token balance using integer microsecond or millisecond units instead of raw seconds float.'
      },
      {
        reviewId: review1.id,
        requestedBy: userAlex.id,
        file: 'src/cache.ts',
        line: 10,
        severity: 'low',
        category: 'maintainability',
        title: 'Explicit Nullability Check',
        description: 'Constructor throws error on non-positive capacity, but lacks a check for `NaN` or non-integer numbers.',
        suggestion: 'Use `Number.isInteger(capacity) && capacity > 0` validation.'
      }
    ]
  })

  // Project 2: Data Analytics Engine (Python)
  console.log('📁 Creating Project 2: Data Analytics Engine (Python)...')
  const projPython = await prisma.project.create({
    data: {
      name: 'python-data-analytics',
      description: 'Stream processing algorithms and statistical aggregations for time-series telemetry.',
      language: 'Python',
      visibility: 'public',
      members: {
        create: [
          { userId: userSarah.id, role: 'Owner' },
          { userId: userAlex.id, role: 'Developer' }
        ]
      }
    }
  })

  const pythonMainCode = `# CodeNest Python Analytics Engine
import math

def calculate_percentiles(values):
    if not values:
        return {}
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    return {
        "p50": sorted_vals[int(n * 0.50)],
        "p90": sorted_vals[int(n * 0.90)],
        "p99": sorted_vals[int(n * 0.99)],
        "mean": sum(sorted_vals) / n
    }

def main():
    print("$ CodeNest Python Telemetry Processor")
    latencies = [12, 15, 18, 22, 25, 29, 35, 42, 58, 120, 240, 310]
    metrics = calculate_percentiles(latencies)
    print("Latency Distribution (ms):")
    for k, v in metrics.items():
        print(f"  {k}: {v:.2f}")

if __name__ == "__main__":
    main()
`

  await prisma.projectFile.create({
    data: {
      projectId: projPython.id,
      name: 'main.py',
      path: 'main.py',
      content: pythonMainCode,
      language: 'python'
    }
  })

  // Review 2 on Project 2
  await prisma.review.create({
    data: {
      projectId: projPython.id,
      creatorId: userSarah.id,
      assigneeId: userAlex.id,
      title: 'PR #12: Statistical percentile algorithms',
      description: 'Added nearest-rank percentile distribution calculations for API latency tracking.',
      status: 'approved'
    }
  })

  // Project 3: Interactive Developer Portfolio (HTML/CSS/JS)
  console.log('📁 Creating Project 3: Minimalist Portfolio (HTML/CSS/JS)...')
  const projWeb = await prisma.project.create({
    data: {
      name: 'developer-portfolio',
      description: 'Modern, minimalist developer portfolio showcase with live project interactive preview.',
      language: 'HTML/CSS/JS',
      visibility: 'private',
      members: {
        create: [
          { userId: userMarcus.id, role: 'Owner' },
          { userId: userAlex.id, role: 'Developer' }
        ]
      }
    }
  })

  await prisma.projectFile.createMany({
    data: [
      {
        projectId: projWeb.id,
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
        projectId: projWeb.id,
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
        projectId: projWeb.id,
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

  // Activities & Notifications
  console.log('🔔 Adding activities and notifications...')
  await prisma.activity.createMany({
    data: [
      {
        projectId: projCache.id,
        userId: userAlex.id,
        type: 'project_created',
        summary: 'Created project distributed-rate-limiter'
      },
      {
        projectId: projCache.id,
        userId: userAlex.id,
        type: 'review_created',
        summary: 'Opened review PR #104 for Token Bucket and LRU Cache'
      },
      {
        projectId: projCache.id,
        userId: userSarah.id,
        type: 'comment_added',
        summary: 'Added a review comment on src/limiter.ts'
      },
      {
        projectId: projPython.id,
        userId: userSarah.id,
        type: 'review_approved',
        summary: 'Approved PR #12: Statistical percentile algorithms'
      }
    ]
  })

  await prisma.notification.createMany({
    data: [
      {
        userId: userAlex.id,
        type: 'new_comment',
        title: 'New review comment from Sarah Chen',
        body: 'Sarah Chen commented on src/limiter.ts in PR #104'
      },
      {
        userId: userAlex.id,
        type: 'review_approved',
        title: 'PR #12 Approved',
        body: 'Sarah Chen approved your Python analytics algorithms'
      }
    ]
  })

  console.log('🎉 Seeding successfully completed!')
  console.log('--------------------------------------------------')
  console.log('Demo Credentials:')
  console.log('  Email: demo@codenest.dev')
  console.log('  Password: password123')
  console.log('--------------------------------------------------')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
