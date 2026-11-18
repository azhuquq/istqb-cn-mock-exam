import {useEffect} from 'react'
import {handleQuestionKey, type QuestionBindings} from './shortcuts'

export function QuestionShortcuts({submitLabel='提交答案', ...bindings}: QuestionBindings & {submitLabel?: string}) {
  const {optionIds,onChoose,onSubmit,onPrevious,onNext}=bindings
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      if(document.querySelector('[aria-modal="true"], dialog[open]'))return
      const target=event.target instanceof Element?event.target:null
      if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="slider"]'))return
      // Preserve native Enter on links, source-image controls and other buttons.
      if(event.key==='Enter'&&target?.closest('button,a,summary')&&!target.closest('.option,[data-answer-submit]'))return
      handleQuestionKey(event,{
        optionIds,onSubmit,onPrevious,onNext,
        onChoose:onChoose?(id)=>{
          onChoose(id)
          // Keep focus with the selected option after a number key, so Enter
          // submits even if a navigation button previously had focus.
          document.querySelector<HTMLButtonElement>(`.option[aria-keyshortcuts="${optionIds.indexOf(id)+1}"]`)?.focus({preventScroll:true})
        }:undefined,
      })
    }
    window.addEventListener('keydown',handle)
    return()=>window.removeEventListener('keydown',handle)
  },[optionIds,onChoose,onSubmit,onPrevious,onNext])
  return <p className="keyboard-hint" aria-label="键盘快捷键">
    {optionIds.length>0&&<><span><kbd>1</kbd>–<kbd>5</kbd> 选择 A–E</span><span><kbd>Enter</kbd> {submitLabel}</span></>}
    <span><kbd>←</kbd> / <kbd>→</kbd> 上一题 / 下一题</span>
  </p>
}
