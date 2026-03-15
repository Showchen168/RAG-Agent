/**
 * Skill Executor Service - HTTP API Tests
 */

// Mock the executor before importing the app
const mockHealthCheck = jest.fn()
const mockExecute = jest.fn()

jest.mock('../executor', () => ({
  DockerExecutor: jest.fn().mockImplementation(() => ({
    healthCheck: mockHealthCheck,
    execute: mockExecute,
  })),
}))

import { app } from '../index'
import http from 'http'

// Simple test helper to make requests without supertest
function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const address = server.address()
    if (!address || typeof address === 'string') {
      reject(new Error('Server not started'))
      return
    }

    const postData = body ? JSON.stringify(body) : undefined
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode ?? 500,
            body: JSON.parse(data),
          })
        } catch {
          resolve({
            status: res.statusCode ?? 500,
            body: { raw: data },
          })
        }
      })
    })

    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

describe('Skill Executor HTTP API', () => {
  let server: http.Server

  beforeAll((done) => {
    server = app.listen(0, '127.0.0.1', () => done())
  })

  afterAll((done) => {
    server.close(done)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ========== GET /health ==========

  describe('GET /health', () => {
    it('should return 200 when Docker is available', async () => {
      mockHealthCheck.mockResolvedValue({
        status: 'ok',
        dockerAvailable: true,
        uptime: 100,
      })

      const res = await makeRequest(server, 'GET', '/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.dockerAvailable).toBe(true)
    })

    it('should return 503 when Docker is unavailable', async () => {
      mockHealthCheck.mockResolvedValue({
        status: 'error',
        dockerAvailable: false,
        uptime: 100,
      })

      const res = await makeRequest(server, 'GET', '/health')

      expect(res.status).toBe(503)
      expect(res.body.status).toBe('error')
    })
  })

  // ========== POST /execute ==========

  describe('POST /execute', () => {
    const validBody = {
      scriptsPath: '/data/skills/user-001/test-skill/scripts',
      llmOutput: 'Generated content',
      baseImage: 'node:20-slim',
      timeout: 60,
      maxMemory: '512m',
      entrypoint: 'entrypoint.sh',
    }

    it('should return 200 on successful execution', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        files: [{ name: 'output.md', path: '/output/output.md', size: 1024 }],
        logs: 'OK',
      })

      const res = await makeRequest(server, 'POST', '/execute', validBody)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect((res.body.files as unknown[]).length).toBe(1)
    })

    it('should return 400 when required fields are missing', async () => {
      const res = await makeRequest(server, 'POST', '/execute', {
        scriptsPath: '/data/test',
        // missing llmOutput and baseImage
      })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it('should return 400 when scriptsPath contains path traversal', async () => {
      const res = await makeRequest(server, 'POST', '/execute', {
        ...validBody,
        scriptsPath: '/data/skills/../../../etc/passwd',
      })

      expect(res.status).toBe(400)
      expect((res.body.error as string)).toContain('..')
    })

    it('should return 400 when scriptsPath is relative', async () => {
      const res = await makeRequest(server, 'POST', '/execute', {
        ...validBody,
        scriptsPath: 'relative/path',
      })

      expect(res.status).toBe(400)
    })

    it('should return 400 when baseImage is not allowed', async () => {
      const res = await makeRequest(server, 'POST', '/execute', {
        ...validBody,
        baseImage: 'malicious-image:latest',
      })

      expect(res.status).toBe(400)
      expect((res.body.error as string)).toContain('baseImage')
    })

    it('should return 500 when executor throws', async () => {
      mockExecute.mockRejectedValue(new Error('Docker daemon unreachable'))

      const res = await makeRequest(server, 'POST', '/execute', validBody)

      expect(res.status).toBe(500)
      expect(res.body.error).toContain('Docker daemon unreachable')
    })
  })
})
