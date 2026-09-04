import { GoogleGenAI, Modality } from '@google/genai';
import {
  getAiProvider,
  getDeepSeekBaseUrl,
  getDeepSeekSavedKey,
  getGeminiSavedKey,
  getMiniMaxBaseUrl,
  getMiniMaxSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
  normalizeDeepSeekChatModelId,
  setGeminiKey,
  getCodesonlineChatSavedKey,
  getCodesonlineChatBaseUrl,
  getHfsySavedKey,
  getHfsyBaseUrl,
  getVolcengineArkCodingSavedKey,
  getAliyunMaasSavedKey,
  getManxueSavedKey,
  getDeepWhiteSavedKey,
} from './aiSettings';
import {
  chatCompletionHistoryAtBase,
  manxueGeminiChatGenerate,
  manxueOpenAiCompatibleChatHistory,
  openAiEditImage,
  openAiGenerateNewImage,
  toApisCanvasVideoGenerate,
  type ToApisVideoModelId,
} from './openaiCompatibleService';
import {
  aliyunMaasChatFetchBase,
  isAliyunMaasChatModelId,
  isAliyunMaasImageModel,
  resolveAliyunMaasChatUpstreamModelId,
} from './aliyunMaas';
import { isVolcengineArkSeedreamImageModel } from './volcengineArkSeedream';
import { normalizeGcpVertexModelWhenDisabled } from './vertexGeminiModelUtils';
import type { ChatCompletionOptions, ChatCompletionResult, ChatCompletionTurn } from './chatCompletionTypes';

export type { ChatCompletionOptions, ChatCompletionResult, ChatCompletionTurn } from './chatCompletionTypes';

const MAX_CHAT_HISTORY_TURNS = 48;

function isDeepSeekChatModelId(modelName: string): boolean {
  const m = normalizeDeepSeekChatModelId(modelName).trim();
  // 其它通道后缀必须排除，避免 deepseek-v4-*-deepwhite 等误走官方 DeepSeek
  if (
    m.endsWith('-ark') ||
    m.endsWith('-aliyun') ||
    m.endsWith('-toapis') ||
    m.endsWith('-manxue') ||
    m.endsWith('-deepwhite') ||
    m.endsWith('-hfsy') ||
    m.endsWith('-codesonline')
  ) {
    return false;
  }
  return m === 'deepseek-v4-flash' || m === 'deepseek-v4-pro' || m.startsWith('deepseek-v4-');
}

/** DeepWhite AI（api.deepwhiteai.com）对话模型 */
function isDeepWhiteChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'glm-5.3-flash-deepwhite' ||
    m === 'qwen3.8-flash-next-deepwhite' ||
    m === 'deepseek-v4-flash-deepwhite' ||
    m === 'deepseek-v4-pro-deepwhite'
  );
}

function resolveDeepWhiteChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'glm-5.3-flash-deepwhite') return 'glm/glm-5.3-flash';
  if (m === 'qwen3.8-flash-next-deepwhite') return 'qwen/qwen3.8-flash-next';
  if (m === 'deepseek-v4-flash-deepwhite') return 'deepseek/deepseek-v4-flash';
  if (m === 'deepseek-v4-pro-deepwhite') return 'deepseek/deepseek-v4-pro';
  return m;
}

function deepWhiteChatFetchBase(): string {
  // 开发 / 生产均走同源代理，避免 CORS
  return '/deepwhite-api/v1';
}

/** MiniMax 对话模型 id（不含火山方舟 -ark 后缀） */
function isMiniMaxChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  if (m.endsWith('-ark')) return false;
  return m === 'minimax-m2.7' || m === 'minimax-m3' || m.startsWith('minimax-');
}

function isVolcengineArkChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'deepseek-v4-flash-ark' ||
    m === 'deepseek-v4-pro-ark' ||
    m === 'doubao-seed-evolving-ark' ||
    m === 'doubao-seed-2.0-lite-ark' ||
    m === 'doubao-seed-2.1-turbo-ark'
  );
}

function resolveVolcengineArkChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'deepseek-v4-flash-ark') return 'deepseek-v4-flash';
  if (m === 'deepseek-v4-pro-ark') return 'deepseek-v4-pro';
  if (m === 'doubao-seed-evolving-ark') return 'doubao-seed-evolving';
  if (m === 'doubao-seed-2.0-lite-ark') return 'doubao-seed-2.0-lite';
  if (m === 'doubao-seed-2.1-turbo-ark') return 'doubao-seed-2.1-turbo';
  return m.replace(/-ark$/, '');
}

function volcengineArkChatFetchBase(): string {
  // Coding Plan：/api/coding/v3（与 Agent Plan 生图 Key/路径分离）
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return '/api/volcengine-ark-proxy/coding';
  }
  return '/volcengine-ark-coding-api';
}

/** codesonline（ai.codesonline.dev）对话模型 id */
function isCodesonlineChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gpt-5.5-codesonline' ||
    m === 'gpt-5.6-sol-codesonline' ||
    m === 'gpt-5.6-terra-codesonline' ||
    m === 'claude-haiku-4-5-codesonline'
  );
}

/** UI 模型 id → ai.codesonline.dev 上游 model 字段 */
function resolveCodesonlineChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-5.6-sol-codesonline') return 'gpt-5.6-sol';
  if (m === 'gpt-5.6-terra-codesonline') return 'gpt-5.6-terra';
  if (m === 'claude-haiku-4-5-codesonline') return 'claude-haiku-4-5';
  return 'gpt-5.5';
}

/** hfsyapi.cn 对话模型 id（与图像通道共用 Key / Base URL） */
function isHfsyChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'gpt-5.6-terra-hfsy' || m === 'grok-4.6-hfsy';
}

/** UI 模型 id → www.hfsyapi.cn 上游 model 字段 */
function resolveHfsyChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'grok-4.6-hfsy') return 'grok-4.6';
  if (m === 'gpt-5.6-terra-hfsy') return 'gpt-5.6-terra';
  return m;
}

/** ToAPIs（https://toapis.com/v1）对话模型；与 hfsy / codesonline / 官方 DeepSeek 分流 */
function isToApisChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'glm-5.3-flash-toapis' ||
    m === 'grok-4.6-toapis' ||
    m === 'gpt-5.4-mini-toapis' ||
    m === 'qwen3.5-flash-toapis' ||
    m === 'gpt-5.6-terra-toapis' ||
    m === 'claude-haiku-4-5-toapis' ||
    m === 'gemini-3.6-flash-toapis' ||
    m === 'qwen3.5-plus-toapis' ||
    m === 'deepseek-v4-flash-toapis'
  );
}

function resolveToApisChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'glm-5.3-flash-toapis') return 'glm-5.3-flash';
  if (m === 'grok-4.6-toapis') return 'grok-4.6';
  if (m === 'gpt-5.4-mini-toapis') return 'gpt-5.4-mini';
  if (m === 'qwen3.5-flash-toapis') return 'qwen3.5-flash';
  if (m === 'gpt-5.6-terra-toapis') return 'gpt-5.6-terra';
  if (m === 'claude-haiku-4-5-toapis') return 'claude-haiku-4-5';
  if (m === 'gemini-3.6-flash-toapis') return 'gemini-3.6-flash';
  if (m === 'qwen3.5-plus-toapis') return 'qwen3.5-plus';
  if (m === 'deepseek-v4-flash-toapis') return 'deepseek-v4-flash';
  return m.replace(/-toapis$/, '');
}

/** 满 eAPI（manxueapi.com）对话：OpenAI 兼容 /v1/chat/completions（GPT / Claude） */
function isManxueOpenAiChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return (
    m === 'gpt-5.5-manxue' ||
    m === 'deepseek-v4-flash-manxue' ||
    m === 'deepseek-v4-pro-manxue'
  );
}

function resolveManxueOpenAiChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gpt-5.5-manxue') return 'gpt-5.5';
  if (m === 'deepseek-v4-flash-manxue') return 'deepseek-v4-flash';
  if (m === 'deepseek-v4-pro-manxue') return 'deepseek-v4-pro';
  return m.replace(/-manxue$/, '');
}

/** 满 eAPI Gemini 对话（Vertex generateContent）；与 GPT/Claude 满 e 分流 */
function isManxueChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'gemini-3.1-flash-manxue' || m === 'gemini-3.1-flash-preview-manxue';
}

/**
 * 满 eAPI 对话上游 model 名（UI id → 提交给 manxueapi.com 的 model 字段）。
 * 经验：上游 `gemini-3.1-flash` 在 gemini 分组下无渠道（503 model_not_found），
 * `gemini-3.1-flash-preview` 是纯对话走通的版本。
 */
function resolveManxueChatUpstreamModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gemini-3.1-flash-preview-manxue') return 'gemini-3.1-flash-preview';
  return 'gemini-3.1-flash-preview';
}

/** Google GenAI 官方模型 id；ToAPIs 等网关可使用带 -official 的别名，直连时需映射 */
function resolveNativeGeminiChatModelId(modelName: string): string {
  const m = (modelName || '').trim();
  if (m === 'gemini-2.0-flash-official') return 'gemini-2.0-flash';
  // ToAPIs 专用 id；Google 直连无对应名称，回落到同系 Flash 预览
  if (m === 'gemini-3.1-flash-lite-preview-official') return 'gemini-3.1-flash-preview';
  return m;
}

// Default API key（未在设置中填写 Gemini 密钥时的占位，生产环境请使用自己的 AIza 密钥）
const DEFAULT_API_KEY = 'AIzaSyBGQmDxkl2VyA092adnINkaMIKHXh6jeiw';

/**
 * 将比例字符串转换为像素尺寸（支持分辨率档位）
 * resolution: '0.5k' | '1k' | '2k' | '4k'，默认 '1k'
 */
const aspectRatioToDimensions = (aspectRatio: string, resolution?: string): { width: number; height: number } => {
  // 根据分辨率档位计算缩放因子（1k 为基准）
  const scaleFactor: Record<string, number> = {
    '0.5k': 0.5,
    '1k': 1,
    '2k': 2,
    '4k': 4,
  };
  const scale = scaleFactor[(resolution || '1k').toLowerCase().trim()] || 1;

  const ratioMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 756 },
    '9:16': { width: 768, height: 1344 },
    '21:9': { width: 1536, height: 672 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
    '2:1': { width: 2048, height: 1024 },
    '3:2': { width: 1536, height: 1024 },
    '2:3': { width: 1024, height: 1536 },
  };
  const base = ratioMap[(aspectRatio || '1:1').trim()] || ratioMap['1:1'];
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
};

/**
 * 生成包含比例和尺寸要求的提示词
 */
const buildPromptWithDimensions = (prompt: string, aspectRatio: string, resolution?: string): string => {
  const dimensions = aspectRatioToDimensions(aspectRatio, resolution);
  const dimensionHint = `IMPORTANT: Generate this image with exactly ${aspectRatio} aspect ratio (${dimensions.width}x${dimensions.height} pixels). The composition must strictly follow this aspect ratio.`;
  return `${dimensionHint}\n\n${prompt}`;
};

/**
 * Creates a Google GenAI client with the provided API key.
 */
const createAIClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey, vertexai: false });
};

const getEffectiveApiKey = (): string => {
  return getGeminiSavedKey() || DEFAULT_API_KEY;
};

// Initialize with settings key first, then fallback default key
let ai = createAIClient(getEffectiveApiKey());

/**
 * Update the API key and reinitialize the client.
 */
export const setApiKey = (apiKey: string) => {
  const normalized = apiKey.trim();
  setGeminiKey(normalized);
  ai = createAIClient(normalized || DEFAULT_API_KEY);
};

/** 从本地存储重新创建 Gemini 客户端（切换提供商或批量保存设置后调用） */
export const initGeminiClientFromStorage = () => {
  ai = createAIClient(getEffectiveApiKey());
};

export const getApiKeyForSettings = (): string => getGeminiSavedKey();

/**
 * Generates new images from a text prompt.
 * Uses Imagen 4 for text-to-image, or prompts Gemini models to generate with text description.
 */
export const generateNewImage = async (
  prompt: string,
  aspectRatio: string = '1:1',
  numberOfImages: number = 1,
  modelName: string = 'imagen-4',
  /** 画布节点 1k/2k/4k；OpenAI 兼容 + ToAPIs Gemini 图像模型时映射为 metadata.resolution */
  outputResolution?: string,
  quality?: string,
  signal?: AbortSignal
): Promise<string[]> => {
  try {
    modelName = normalizeGcpVertexModelWhenDisabled(modelName);

    if (getAiProvider() === 'openai-compatible') {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, modelName, outputResolution, quality, signal);
    }

    const model = modelName || 'imagen-4';
    if (model === 'gpt-image-2-codesonline') {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, model, outputResolution, quality, signal);
    }
    if (model === 'gpt-image-2-hfsy' || model === 'gpt-image-2pro-hfsy' || model === 'gpt-image-2pro-4k-hfsy' || model === 'nano-banana-2-hfsy' || model === 'nano-banana-pro-hfsy' || model === 'gemini-3.1-flash-image-preview-hfsy' || model === 'gemini-3-pro-image-preview-hfsy') {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, model, outputResolution, quality, signal);
    }
    if (isAliyunMaasImageModel(model)) {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, model, outputResolution, quality, signal);
    }
    if (isVolcengineArkSeedreamImageModel(model)) {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, model, outputResolution, quality, signal);
    }
    if (model === 'qwen-image-3.0') {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, model, outputResolution, quality, signal);
    }
    if (model === 'gpt-image-2' || model === 'gpt-image-1' || model.startsWith('gpt-image-')) {
      throw new Error(
        'GPT Image 2（ToAPIs）等需在「设置 → API」中使用 OpenAI 兼容主通道，Base URL 指向 ToAPIs（https://toapis.com/v1）。codesonline 通路请选择「GPT Image 2（codesonline）」并填写对应密钥。'
      );
    }
    // 构建包含比例和尺寸要求的提示词
    const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio, outputResolution);

    // Imagen 模型使用 generateImages API
    if (model === 'imagen-4' || model === 'imagen-4.0-generate-001') {
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: enhancedPrompt,
        config: {
          numberOfImages: numberOfImages,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio,
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        return response.generatedImages.map(img => img.image.imageBytes);
      }
      throw new Error("模型未返回图片。");
    }

    // Gemini 模型使用 generateContent API（引导生成）
    const dimensions = aspectRatioToDimensions(aspectRatio, outputResolution);
    const stylePrompt = `${enhancedPrompt}\n\nPlease generate an image with exactly ${aspectRatio} aspect ratio (${dimensions.width}x${dimensions.height} pixels). Output ONLY the image without any text explanation.`;

    const results: string[] = [];
    for (let i = 0; i < numberOfImages; i++) {
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [{ text: stylePrompt }],
        },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      let foundImage = false;
      for (const part of parts) {
        if (part.inlineData) {
          results.push(part.inlineData.data);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error(`模型 ${modelName} 未返回图片，请尝试其他模型或检查 API 配置。`);
      }
    }

    return results;
  } catch (error) {
    console.error("生成图片时出错:", error);
    throw error;
  }
};

/**
 * Edits existing images based on a text prompt using Gemini models.
 * Supports: gemini-3.1-flash-image-preview, gemini-3-pro-image-preview, gemini-2.5-flash-image
 */
export const editExistingImage = async (
  base64Images: string[],
  prompt: string,
  numberOfImages: number = 1,
  modelName: string = 'gemini-3.1-flash-image-preview',
  aspectRatio: string = '1:1',
  outputResolution?: string,
  quality?: string,
  pixelSize?: string,
  signal?: AbortSignal
): Promise<string[]> => {
  try {
    modelName = normalizeGcpVertexModelWhenDisabled(modelName);

    if (getAiProvider() === 'openai-compatible') {
      return openAiEditImage(base64Images, prompt, numberOfImages, modelName, aspectRatio, outputResolution, quality, pixelSize, signal);
    }

    const results: string[] = [];
    const model = modelName || 'gemini-3.1-flash-image-preview';
    if (model === 'gpt-image-2-codesonline') {
      return openAiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, outputResolution, quality, pixelSize, signal);
    }
    if (model === 'gpt-image-2-hfsy' || model === 'gpt-image-2pro-hfsy' || model === 'gpt-image-2pro-4k-hfsy' || model === 'nano-banana-2-hfsy' || model === 'nano-banana-pro-hfsy' || model === 'gemini-3.1-flash-image-preview-hfsy' || model === 'gemini-3-pro-image-preview-hfsy') {
      return openAiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, outputResolution, quality, pixelSize, signal);
    }
    if (isAliyunMaasImageModel(model)) {
      return openAiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, outputResolution, quality, pixelSize, signal);
    }
    if (isVolcengineArkSeedreamImageModel(model)) {
      return openAiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, outputResolution, quality, pixelSize, signal);
    }
    if (model === 'qwen-image-3.0') {
      return openAiEditImage(base64Images, prompt, numberOfImages, model, aspectRatio, outputResolution, quality, pixelSize, signal);
    }
    if (model === 'gpt-image-2' || model === 'gpt-image-1' || model.startsWith('gpt-image-')) {
      throw new Error(
        'GPT Image 2（ToAPIs）图生图需使用 OpenAI 兼容主通道与 ToAPIs。codesonline 请选择对应节点模型并填写密钥。'
      );
    }
    const sizeHint = pixelSize
      ? ` IMPORTANT: Output image size must be ${pixelSize} pixels, matching reference aspect ratio.`
      : '';
    const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio, outputResolution) + sizeHint;

    for (let i = 0; i < numberOfImages; i++) {
      const imageParts = base64Images.map(base64 => ({
        inlineData: {
          data: base64,
          mimeType: 'image/jpeg',
        },
      }));

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            ...imageParts,
            { text: enhancedPrompt },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      let foundImage = false;
      for (const part of parts) {
        if (part.inlineData) {
          results.push(part.inlineData.data);
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        throw new Error("响应中未找到图片数据。");
      }
    }

    return results;
  } catch (error) {
    console.error("编辑图片时出错:", error);
    throw error;
  }
};

/**
 * 多轮对话：整段 history 提交给模型（DeepSeek / OpenAI 兼容 / Gemini 直连）
 */
export const callGeminiChatWithHistory = async (
  turns: ChatCompletionTurn[],
  modelName: string = 'gemini-2.5-flash',
  opts?: ChatCompletionOptions
): Promise<ChatCompletionResult> => {
  if (!turns.length) throw new Error('对话内容为空');
  let slice = turns;
  if (slice.length > MAX_CHAT_HISTORY_TURNS) {
    slice = slice.slice(-MAX_CHAT_HISTORY_TURNS);
    while (slice.length > 0 && slice[0].role === 'assistant') {
      slice = slice.slice(1);
    }
  }

  try {
    modelName = normalizeGcpVertexModelWhenDisabled(modelName);

    if (isVolcengineArkChatModelId(modelName)) {
      const arkKey = getVolcengineArkCodingSavedKey().trim();
      if (!arkKey) {
        throw new Error(
          '未配置火山方舟 Coding Plan API Key。请在「设置 → API → 火山方舟」填写 Coding Plan Key（对话走 /api/coding/v3；与 Seedream 用的 Agent Plan Key 不同）。'
        );
      }
      return { text: await chatCompletionHistoryAtBase(
        volcengineArkChatFetchBase(),
        arkKey,
        resolveVolcengineArkChatUpstreamModelId(modelName),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    if (isAliyunMaasChatModelId(modelName)) {
      const aliyunKey = getAliyunMaasSavedKey().trim();
      if (!aliyunKey) {
        throw new Error('使用阿里云百炼对话模型：请在「设置 → API → 阿里云百炼」填写 API Key 并保存。');
      }
      return { text: await chatCompletionHistoryAtBase(
        aliyunMaasChatFetchBase(),
        aliyunKey,
        resolveAliyunMaasChatUpstreamModelId(modelName),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    if (isManxueOpenAiChatModelId(modelName)) {
      const mxKey = getManxueSavedKey().trim();
      if (!mxKey) {
        throw new Error('使用满 e 对话模型：请在「设置 → API」中填写「满 e API Key」。');
      }
      return {
        text: await manxueOpenAiCompatibleChatHistory(
          slice.map((t) => ({
            role: t.role,
            content: t.content,
            imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
            imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
          })),
          resolveManxueOpenAiChatUpstreamModelId(modelName)
        ),
      };
    }

    if (isManxueChatModelId(modelName)) {
      // 满 e 对话走 Vertex AI 风格 /v1beta/models/{model}:generateContent（?key= 鉴权），
      // 不能用 OpenAI /chat/completions —— 上游 Gemini 网关不会识别 chat completions 格式
      return { text: await manxueGeminiChatGenerate(slice, resolveManxueChatUpstreamModelId(modelName)) };
    }

    // DeepWhite 须在官方 DeepSeek 之前匹配（UI id 也以 deepseek-v4- 开头）
    if (isDeepWhiteChatModelId(modelName)) {
      const dwKey = getDeepWhiteSavedKey().trim();
      if (!dwKey) {
        throw new Error(
          '使用 DeepWhite 对话模型：请在「设置 → API」中填写「DeepWhite API Key」（Base URL 为 https://api.deepwhiteai.com/v1）。'
        );
      }
      return {
        text: await chatCompletionHistoryAtBase(
          deepWhiteChatFetchBase(),
          dwKey,
          resolveDeepWhiteChatUpstreamModelId(modelName),
          slice.map((t) => ({
            role: t.role,
            content: t.content,
            imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
            imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
          }))
        ),
      };
    }

    if (isDeepSeekChatModelId(modelName)) {
      let key = getDeepSeekSavedKey();
      let base = getDeepSeekBaseUrl();
      if (!key && getAiProvider() === 'openai-compatible') {
        const bu = getOpenAiBaseUrl().toLowerCase();
        if (bu.includes('deepseek')) {
          key = getOpenAiSavedKey();
          base = getOpenAiBaseUrl();
        }
      }
      if (!key) {
        throw new Error(
          '使用 DeepSeek 对话：请在「设置 → API」填写「DeepSeek API Key」；或将接口类型设为「OpenAI 兼容」并把 Base URL 设为 https://api.deepseek.com/v1 后填写同一密钥。'
        );
      }
      return { text: await chatCompletionHistoryAtBase(
        base,
        key,
        normalizeDeepSeekChatModelId(modelName).trim(),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    if (isMiniMaxChatModelId(modelName)) {
      const mxKey = getMiniMaxSavedKey().trim();
      if (!mxKey) {
        throw new Error(
          '使用 MiniMax M2.7：请在「设置 → API」中填写「MiniMax API Key」，并确认 Base URL 为 https://api.minimaxi.com/v1。'
        );
      }
      return { text: await chatCompletionHistoryAtBase(
        getMiniMaxBaseUrl(),
        mxKey,
        modelName,
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    // codesonline（ai.codesonline.dev）对话：GPT-5.5 / GPT-5.6 Sol / GPT-5.6 Terra / Claude Haiku 4.5
    if (isCodesonlineChatModelId(modelName)) {
      const coKey = getCodesonlineChatSavedKey().trim();
      if (!coKey) {
        throw new Error(
          '使用 codesonline 对话模型：请在「设置 → API」中填写「codesonline API Key（对话）」。'
        );
      }
      // 开发 / 生产均走同源代理 /codesonline-chat-api → ai.codesonline.dev
      return { text: await chatCompletionHistoryAtBase(
        '/codesonline-chat-api',
        coKey,
        resolveCodesonlineChatUpstreamModelId(modelName),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    // hfsyapi.cn 对话：GPT-5.6 Terra / Grok 4.6（OpenAI 兼容 /v1/chat/completions，经同源代理）
    if (isHfsyChatModelId(modelName)) {
      const hfsyKey = getHfsySavedKey().trim();
      if (!hfsyKey) {
        throw new Error(
          '使用 hfsyapi.cn 对话模型：请在「设置 → API」中填写「hfsyapi.cn」API Key。'
        );
      }
      return { text: await chatCompletionHistoryAtBase(
        getHfsyBaseUrl(),
        hfsyKey,
        resolveHfsyChatUpstreamModelId(modelName),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    if (isToApisChatModelId(modelName)) {
      const apiKey = getOpenAiSavedKey();
      if (!apiKey) {
        throw new Error(
          '使用 ToAPIs 对话模型：请在「设置 → API」选择「OpenAI 兼容」，填写 ToAPIs API Key（Base URL 为 https://toapis.com/v1）。'
        );
      }
      return { text: await chatCompletionHistoryAtBase(
        getOpenAiBaseUrl(),
        apiKey,
        resolveToApisChatUpstreamModelId(modelName),
        slice.map((t) => ({
          role: t.role,
          content: t.content,
          imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
          imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
        }))
      ) };
    }

    if (getAiProvider() === 'openai-compatible') {
      const apiKey = getOpenAiSavedKey();
      if (!apiKey) throw new Error('未配置 OpenAI 兼容 API Key，请在设置中选择「OpenAI 兼容」并填写密钥。');
      return { text: await chatCompletionHistoryAtBase(getOpenAiBaseUrl(), apiKey, modelName, slice.map((t) => ({
        role: t.role,
        content: t.content,
        imageBase64: t.role === 'user' ? t.imageBase64 : undefined,
        imageBase64s: t.role === 'user' ? t.imageBase64s : undefined,
      }))) };
    }

    const contents = slice.map((t) => {
      if (t.role === 'assistant') {
        return { role: 'model' as const, parts: [{ text: t.content }] };
      }
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      const imgs: string[] = [];
      if (t.imageBase64s?.length) imgs.push(...t.imageBase64s);
      if (t.imageBase64) imgs.push(t.imageBase64);
      for (const b64 of imgs) {
        parts.push({
          inlineData: { data: b64, mimeType: 'image/jpeg' },
        });
      }
      parts.push({ text: t.content });
      return { role: 'user' as const, parts };
    });

    const response = await ai.models.generateContent({
      model: resolveNativeGeminiChatModelId(modelName),
      contents: contents as unknown,
      config: {
        responseModalities: [Modality.TEXT],
      },
    });

    const textParts = response.candidates?.[0]?.content?.parts?.filter((part) => part.text) || [];
    const responseText = textParts.map((part) => part.text).join('');

    if (!responseText) {
      throw new Error('模型未返回有效响应');
    }

    return { text: responseText };
  } catch (error) {
    console.error('对话请求出错:', error);
    throw error;
  }
};

/**
 * 处理对话请求（文本 / 可选单张参考图）
 * - Gemini 直连：`gemini-2.0-flash-official` → `gemini-2.0-flash`；`gemini-3.1-flash-lite-preview-official` → `gemini-3.1-flash-preview`
 * - OpenAI 兼容（含 ToAPIs https://toapis.com/v1）：上述带 -official 的 id 原样作为 model 提交
 */
export const callGeminiChat = async (prompt: string, base64Image?: string, modelName: string = 'gemini-2.5-flash'): Promise<string> => {
  const result = await callGeminiChatWithHistory([{ role: 'user', content: prompt, imageBase64: base64Image }], modelName);
  return result.text;
};

/** 供设置页等读取 OpenAI 兼容 Base URL（历史导入名兼容） */
export { getOpenAiBaseUrl as getOpenAICompatBaseUrlForSettings } from './aiSettings';

/** 画布「视频生成」节点：ToAPIs（grok-video-3 / sora-2-vvip / veo3.1-fast，逻辑见 openaiCompatibleService） */
export async function generateCanvasVideoViaToApis(
  prompt: string,
  opts: {
    videoModel: ToApisVideoModelId;
    durationSeconds: number;
    aspectRatio: string;
    resolution: '480p' | '720p' | '1080p' | '4k';
    referenceImagesBase64?: string[];
    referenceVideoUrls?: string[];
    referenceAudioBase64?: string;
    signal?: AbortSignal;
  }
): Promise<string> {
  return toApisCanvasVideoGenerate({ prompt, ...opts });
}
