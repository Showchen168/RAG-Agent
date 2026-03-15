import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SkillButtonPanel } from '../skill-button-panel'
import type { Skill, SkillConfig } from '@/types/skills'

function makeSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    name: 'test-skill',
    displayName: 'Test Skill',
    description: 'A test skill',
    icon: 'FileText',
    category: 'document',
    input: { type: 'context' },
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

describe('SkillButtonPanel', () => {
  it('renders nothing when skills array is empty', () => {
    const { container } = render(
      <SkillButtonPanel
        skills={[]}
        executingSkillId={null}
        onSkillClick={jest.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a button for each skill', () => {
    const skills = [
      makeSkill({ id: 's1', display_name: 'Summary' }),
      makeSkill({ id: 's2', display_name: 'Translate' }),
    ]

    render(
      <SkillButtonPanel
        skills={skills}
        executingSkillId={null}
        onSkillClick={jest.fn()}
      />,
    )

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Translate')).toBeInTheDocument()
  })

  it('calls onSkillClick with the skill when button is clicked', () => {
    const skill = makeSkill({ id: 's1', display_name: 'Summary' })
    const handleClick = jest.fn()

    render(
      <SkillButtonPanel
        skills={[skill]}
        executingSkillId={null}
        onSkillClick={handleClick}
      />,
    )

    fireEvent.click(screen.getByText('Summary'))
    expect(handleClick).toHaveBeenCalledWith(skill)
  })

  it('disables all buttons when a skill is executing', () => {
    const skills = [
      makeSkill({ id: 's1', display_name: 'Summary' }),
      makeSkill({ id: 's2', display_name: 'Translate' }),
    ]

    render(
      <SkillButtonPanel
        skills={skills}
        executingSkillId="s1"
        onSkillClick={jest.fn()}
      />,
    )

    const buttons = screen.getAllByRole('button')
    buttons.forEach(btn => {
      expect(btn).toBeDisabled()
    })
  })

  it('shows spinner on the executing skill button', () => {
    const skill = makeSkill({ id: 's1', display_name: 'Summary' })

    const { container } = render(
      <SkillButtonPanel
        skills={[skill]}
        executingSkillId="s1"
        onSkillClick={jest.fn()}
      />,
    )

    // 應有 animate-spin 的元素
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('does not call onSkillClick when disabled', () => {
    const skill = makeSkill({ id: 's1', display_name: 'Summary' })
    const handleClick = jest.fn()

    render(
      <SkillButtonPanel
        skills={[skill]}
        executingSkillId="s1"
        onSkillClick={handleClick}
      />,
    )

    fireEvent.click(screen.getByText('Summary'))
    expect(handleClick).not.toHaveBeenCalled()
  })
})
