/** 多轮对话单轮结构（供画布对话节点串联历史） */
export type ChatCompletionTurn = {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  imageBase64s?: string[];
  /** 仅 user：公开 http(s) 视频地址，供支持 video_url / Gemini fileData 的对话接口 */
  videoUrls?: string[];
  /** 仅 user：从成片抽出的音轨（无 data: 前缀） */
  audioBase64?: string;
  audioMime?: string;
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
