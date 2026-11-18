// Shared by release validation and saved-record validation.
export const isQuestionId = value => typeof value === 'string' && /^(?:[A-D]-(?:[1-9]|[1-3]\d|40)|A-A(?:[1-9]|1\d|2[0-6]))$/.test(value)
