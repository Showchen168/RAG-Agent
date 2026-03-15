import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SkillInputDialog } from '../skill-input-dialog'
import type { Skill, SkillConfig } from '@/types/skills'

function makeSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    name: 'test-skill',
    displayName: 'Test Skill',
    description: 'A test skill',
    icon: 'FileText',
    category: 'document',
    input: { type: 'user', userInputLabel: '請輸入主題' },
    output: { fileType: 'md', mimeType: 'text/markdown', previewFormat: 'markdown' },
    runtime: { baseImage: 'node:20', timeout: 30, maxMemory: '256m' },
    ...overrides,
  }
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    user_id: 'user-1',
    name: 'test-skill',
    display_name: 'Test Skill',
    description: 'A test skill',
    icon: 'FileText',
    category: 'document',
    version: '1.0.0',
    skill_md: '# Test',
    skill_config: makeSkillConfig(),
    storage_path: '/skills/test',
    is_system: false,
    is_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('SkillInputDialog', () => {
  const noClarify = jest.fn().mockResolvedValue(null)

  it('renders nothing when skill is null', () => {
    const { container } = render(
      <SkillInputDialog
        skill={null}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders skill name and description', () => {
    noClarify.mockClear()
    const skill = makeSkill({
      display_name: 'Document Generator',
      description: 'Generates documents from input',
    })

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    expect(screen.getByText('Document Generator')).toBeInTheDocument()
    expect(screen.getByText('Generates documents from input')).toBeInTheDocument()
  })

  it('renders input label from skill config', () => {
    noClarify.mockClear()
    const skill = makeSkill({
      skill_config: makeSkillConfig({
        input: { type: 'user', userInputLabel: '請描述你的需求' },
      }),
    })

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    expect(screen.getByLabelText('請描述你的需求')).toBeInTheDocument()
  })

  it('renders default label when userInputLabel is not provided', () => {
    noClarify.mockClear()
    const skill = makeSkill({
      skill_config: makeSkillConfig({
        input: { type: 'user' },
      }),
    })

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    expect(screen.getByLabelText('輸入內容')).toBeInTheDocument()
  })

  it('calls onSubmit with input text when confirm button is clicked', async () => {
    noClarify.mockClear()
    const skill = makeSkill()
    const handleSubmit = jest.fn()

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={handleSubmit}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'My topic' } })

    const submitBtn = screen.getByRole('button', { name: /下一步/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('My topic')
    })
  })

  it('disables submit button when input is empty', () => {
    noClarify.mockClear()
    const skill = makeSkill()

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /下一步/i })
    expect(submitBtn).toBeDisabled()
  })

  it('calls onCancel when cancel button is clicked', () => {
    noClarify.mockClear()
    const skill = makeSkill()
    const handleCancel = jest.fn()

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={handleCancel}
        onClarify={noClarify}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /取消/i })
    fireEvent.click(cancelBtn)

    expect(handleCancel).toHaveBeenCalled()
  })

  it('clears input after submit', async () => {
    noClarify.mockClear()
    const skill = makeSkill()

    render(
      <SkillInputDialog
        skill={skill}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        onClarify={noClarify}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'My topic' } })
    expect(input).toHaveValue('My topic')

    const submitBtn = screen.getByRole('button', { name: /下一步/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })
})
