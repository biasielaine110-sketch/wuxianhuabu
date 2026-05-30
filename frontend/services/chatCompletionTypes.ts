/** 多轮对话单轮结构（供画布对话节点串联历史） */
export type ChatCompletionTurn = {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  imageBase64s?: string[];
};

export type ChatCompletionResult = {
  text: string;
  /** 对话模型可在同轮回复中直接返回图片 */
  images?: string[];
};

export type ChatCompletionOptions = {
  aspectRatio?: string;
  outputResolution?: string;
};
