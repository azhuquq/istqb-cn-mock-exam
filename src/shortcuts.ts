export interface QuestionBindings {
  optionIds: readonly string[]
  onChoose?: (option: string) => void
  onEnter?: () => void
  onPrevious?: () => void
  onNext?: () => void
}

type QuestionKeyEvent = Pick<KeyboardEvent, 'key' | 'repeat' | 'isComposing' | 'keyCode' | 'defaultPrevented' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'preventDefault'>

// Consume recognized keys even at a boundary or before enough options are
// selected, so Enter cannot also activate the focused answer button.
export function handleQuestionKey(event: QuestionKeyEvent, bindings: QuestionBindings): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false
  const option = /^[1-5]$/.test(event.key) ? bindings.optionIds[Number(event.key) - 1] : undefined
  if (!option && !['Enter', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return false
  event.preventDefault()
  if (event.repeat) return true
  if (option) bindings.onChoose?.(option)
  else if (event.key === 'Enter') bindings.onEnter?.()
  else if (event.key === 'ArrowLeft') bindings.onPrevious?.()
  else bindings.onNext?.()
  return true
}
