import {describe,expect,it,vi} from 'vitest'
import {handleQuestionKey, type QuestionBindings} from '../src/shortcuts'

function key(key:string, overrides:Partial<Parameters<typeof handleQuestionKey>[0]>={}) {
  return {key,repeat:false,isComposing:false,keyCode:0,defaultPrevented:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,preventDefault:vi.fn(),...overrides}
}
function bindings(optionIds=[...'ABCDE']):QuestionBindings {
  return {optionIds,onChoose:vi.fn(),onSubmit:vi.fn(),onPrevious:vi.fn(),onNext:vi.fn()}
}
describe('question keyboard controls',()=>{
  it('maps the five number keys to their actual options without also submitting',()=>{
    const actions=bindings()
    for(const number of ['1','2','3','4','5'])expect(handleQuestionKey(key(number),actions)).toBe(true)
    expect(vi.mocked(actions.onChoose!).mock.calls.map(call=>call[0])).toEqual([...'ABCDE'])
    expect(actions.onSubmit).not.toHaveBeenCalled()
  })
  it('ignores absent fifth options and unrelated keys',()=>{
    const actions=bindings([...'ABCD'])
    for(const name of ['5','0','6','A','Escape','ArrowUp',' ']){
      const event=key(name)
      expect(handleQuestionKey(event,actions)).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
    expect(actions.onChoose).not.toHaveBeenCalled()
  })
  it('submits only on Enter and navigates in the correct direction',()=>{
    const actions=bindings()
    for(const name of ['Enter','ArrowLeft','ArrowRight']){
      const event=key(name)
      expect(handleQuestionKey(event,actions)).toBe(true)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    expect(actions.onSubmit).toHaveBeenCalledOnce()
    expect(actions.onPrevious).toHaveBeenCalledOnce()
    expect(actions.onNext).toHaveBeenCalledOnce()
    expect(actions.onChoose).not.toHaveBeenCalled()
  })
  it('does not let held keys repeatedly toggle choices, submit or navigate',()=>{
    const actions=bindings()
    for(const name of ['1','Enter','ArrowLeft','ArrowRight']){
      const event=key(name,{repeat:true})
      expect(handleQuestionKey(event,actions)).toBe(true)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    for(const action of [actions.onChoose,actions.onSubmit,actions.onPrevious,actions.onNext])expect(action).not.toHaveBeenCalled()
  })
  it('leaves modifier shortcuts, IME composition and previously handled keys alone',()=>{
    const actions=bindings()
    for(const overrides of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true}]){
      const event=key('1',overrides)
      expect(handleQuestionKey(event,actions)).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
    expect(actions.onChoose).not.toHaveBeenCalled()
  })
  it('keeps incomplete/read-only answers and first/last question boundaries inert',()=>{
    const actions={optionIds:[...'ABCD']}
    for(const name of ['1','Enter','ArrowLeft','ArrowRight']){
      const event=key(name)
      expect(handleQuestionKey(event,actions)).toBe(true)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
  })
})
