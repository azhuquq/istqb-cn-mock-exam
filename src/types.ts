export interface Question {
  id: string; paper: string; number: string; supplementary: boolean; chapter: number;
  stem: string; options: {id: string; text: string}[];
  correctAnswers: string[]; selectionCount: number; learningObjective: string;
  level: string; points: number; explanation: string;
  sourcePages: number[]; answerPages: number[];
  sourceImages: string[]; answerImages: string[]; stemImages: string[];
}
export interface Source {paper: string; questionFile: string; answerFile: string; questionSha256: string; answerSha256: string}
export interface Bank {version: number; bankVersion: string; syllabus: string; sources: Source[]; questions: Question[]}
export type FormalPaper = 'A' | 'B' | 'C' | 'D'
interface AttemptBase {
  id: string; questionIds: string[]; bankVersion?: string;
  answers: Record<string, string[]>; flags: string[];
  startedAt: number; deadline: number; endedAt: number | null;
  status: 'active' | 'completed'; index: number;
}
export type Attempt = AttemptBase & ({paper: FormalPaper; seed?: never} | {paper: 'mixed'; seed: string})
export interface MistakeResponse {
  answers: string[]; submitted: boolean; bankVersion: string;
  source: 'exam' | 'practice'; attemptId?: string;
}
export interface StudyState {
  schemaVersion: 1;
  practice: {filter: string; index: number; answers: Record<string, string[]>; submitted: Record<string, boolean>; bankVersions?: Record<string,string>};
  activeExam: Attempt | null; history: Attempt[]; mistakes: string[];
  mistakeResponses: Record<string,MistakeResponse>;
}
