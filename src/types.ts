export interface Question {
  id: string; paper: string; number: string; supplementary: boolean; chapter: number;
  stem: string; options: {id: string; text: string}[];
  correctAnswers: string[]; selectionCount: number; learningObjective: string;
  level: string; points: number; explanation: string;
  sourcePages: number[]; answerPages: number[];
  sourceImages: string[]; answerImages: string[]; stemImages: string[];
}
export interface Source {paper: string; questionFile: string; answerFile: string; questionSha256: string; answerSha256: string}
export interface Bank {version: number; syllabus: string; sources: Source[]; questions: Question[]}
export interface Attempt {
  id: string; paper: string; questionIds: string[];
  answers: Record<string, string[]>; flags: string[];
  startedAt: number; deadline: number; endedAt: number | null;
  status: 'active' | 'completed'; index: number;
}
export interface StudyState {
  schemaVersion: 1;
  practice: {filter: string; index: number; answers: Record<string, string[]>; submitted: Record<string, boolean>};
  activeExam: Attempt | null; history: Attempt[]; mistakes: string[];
}
