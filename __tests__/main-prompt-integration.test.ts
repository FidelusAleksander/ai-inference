import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type MockedFunction,
  type Mock
} from 'vitest'
import * as core from '../__fixtures__/core.js'

// Create fs mocks
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

// Create inference mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSimpleInference = vi.fn() as MockedFunction<any>
const mockMcpInference = vi.fn()

// Create MCP mocks
const mockConnectToGitHubMCP = vi.fn()

// Mock fs module
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync
}))

// Mock the inference functions
vi.mock('../src/inference.js', () => ({
  simpleInference: mockSimpleInference,
  mcpInference: mockMcpInference
}))

// Mock the MCP connection
vi.mock('../src/mcp.js', () => ({
  connectToGitHubMCP: mockConnectToGitHubMCP
}))

vi.mock('@actions/core', () => core)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts - prompt.yml integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock environment variables
    process.env['GITHUB_TOKEN'] = 'test-token'

    // Mock core.getInput to return appropriate values
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'model':
          return 'openai/gpt-4o'
        case 'max-tokens':
          return '200'
        case 'endpoint':
          return 'https://models.github.ai/inference'
        case 'enable-github-mcp':
          return 'false'
        default:
          return ''
      }
    })

    // Mock core.getBooleanInput
    const mockGetBooleanInput = core.getBooleanInput as Mock
    mockGetBooleanInput.mockReturnValue(false)

    // Mock fs.readFileSync for prompt file
    mockReadFileSync.mockReturnValue(`
messages:
  - role: system
    content: Be as concise as possible
  - role: user
    content: 'Compare {{a}} and {{b}}, please'
model: openai/gpt-4o
    `)

    // Mock fs.writeFileSync
    mockWriteFileSync.mockImplementation(() => {})

    // Mock simpleInference
    mockSimpleInference.mockResolvedValue('Mocked AI response')
  })

  it('should handle prompt YAML files with template variables', async () => {
    mockExistsSync.mockReturnValue(true)
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'prompt-file':
          return 'test.prompt.yml'
        case 'input':
          return 'a: cats\nb: dogs'
        case 'model':
          return 'openai/gpt-4o'
        case 'max-tokens':
          return '200'
        case 'endpoint':
          return 'https://models.github.ai/inference'
        case 'enable-github-mcp':
          return 'false'
        default:
          return ''
      }
    })

    await run()

    // Verify simpleInference was called with the correct message structure
    expect(mockSimpleInference).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'Be as concise as possible'
          },
          {
            role: 'user',
            content: 'Compare cats and dogs, please'
          }
        ],
        modelName: 'openai/gpt-4o',
        maxTokens: 200,
        endpoint: 'https://models.github.ai/inference',
        token: 'test-token'
      })
    )

    // Verify outputs were set
    expect(core.setOutput).toHaveBeenCalledWith(
      'response',
      'Mocked AI response'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'response-file',
      expect.any(String)
    )
  })

  it('should fall back to legacy format when not using prompt YAML', async () => {
    mockExistsSync.mockReturnValue(false)
    core.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'prompt':
          return 'Hello, world!'
        case 'system-prompt':
          return 'You are helpful'
        case 'model':
          return 'openai/gpt-4o'
        case 'max-tokens':
          return '200'
        case 'endpoint':
          return 'https://models.github.ai/inference'
        case 'enable-github-mcp':
          return 'false'
        default:
          return ''
      }
    })

    await run()

    // Verify simpleInference was called with converted message format
    expect(mockSimpleInference).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'You are helpful'
          },
          {
            role: 'user',
            content: 'Hello, world!'
          }
        ],
        modelName: 'openai/gpt-4o',
        maxTokens: 200,
        endpoint: 'https://models.github.ai/inference',
        token: 'test-token'
      })
    )
  })
})
