import { GoogleGenAI, Modality } from '@google/genai';
import {
  getAiProvider,
  getDeepSeekBaseUrl,
  getDeepSeekSavedKey,
  getGeminiSavedKey,
  getOpenAiBaseUrl,
  getOpenAiSavedKey,
  setGeminiKey,
} from './aiSettings';
import {
  chatCompletionAtBase,
  openAiChatCompletion,
  openAiEditImage,
  openAiGenerateNewImage,
  toApisCanvasVideoGenerate,
} from './openaiCompatibleService';

function isDeepSeekChatModelId(modelName: string): boolean {
  const m = (modelName || '').trim();
  return m === 'deepseek-chat' || m === 'deepseek-reasoner' || m.startsWith('deepseek-');
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
 * 将比例字符串转换为像素尺寸
 */
const aspectRatioToDimensions = (aspectRatio: string): { width: number; height: number } => {
  const ratioMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 756 },
    '9:16': { width: 768, height: 1344 },
    '21:9': { width: 1536, height: 672 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  };
  return ratioMap[aspectRatio] || ratioMap['1:1'];
};

/**
 * 生成包含比例和尺寸要求的提示词
 */
const buildPromptWithDimensions = (prompt: string, aspectRatio: string): string => {
  const dimensions = aspectRatioToDimensions(aspectRatio);
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
  /** 画布节点 1k/2k/4k；OpenAI 兼容 + ToAPIs 且 gemini-3.1-flash-image-preview 时映射为 metadata.resolution */
  outputResolution?: string,
  signal?: AbortSignal
): Promise<string[]> => {
  try {
    if (getAiProvider() === 'openai-compatible') {
      return openAiGenerateNewImage(prompt, aspectRatio, numberOfImages, modelName, outputResolution, signal);
    }

    const model = modelName || 'imagen-4';
    if (model === 'gpt-image-2' || model === 'gpt-image-1' || model.startsWith('gpt-image-')) {
      throw new Error(
        'GPT Image 2 等模型需在「设置 → API」中将接口类型切换为「OpenAI 兼容」，并配置支持 gpt-image-2 的网关（例如 ToAPIs：https://toapis.com/v1）。'
      );
    }
    // 构建包含比例和尺寸要求的提示词
    const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);

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
    const dimensions = aspectRatioToDimensions(aspectRatio);
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
  signal?: AbortSignal
): Promise<string[]> => {
  try {
    if (getAiProvider() === 'openai-compatible') {
      return openAiEditImage(base64Images, prompt, numberOfImages, modelName, aspectRatio, outputResolution, signal);
    }

    const results: string[] = [];
    const model = modelName || 'gemini-3.1-flash-image-preview';
    if (model === 'gpt-image-2' || model === 'gpt-image-1' || model.startsWith('gpt-image-')) {
      throw new Error(
        'GPT Image 2 图生图需使用「OpenAI 兼容」接口与对应网关（如 ToAPIs）；Google Gemini 直连不支持该模型 id。'
      );
    }
    // 构建包含比例和尺寸要求的提示词
    const enhancedPrompt = buildPromptWithDimensions(prompt, aspectRatio);

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
 * 处理对话请求（文本 / 可选单张参考图）
 * - Gemini 直连：`gemini-2.0-flash-official` → `gemini-2.0-flash`；`gemini-3.1-flash-lite-preview-official` → `gemini-3.1-flash-preview`
 * - OpenAI 兼容（含 ToAPIs https://toapis.com/v1）：上述带 -official 的 id 原样作为 model 提交
 */
export const callGeminiChat = async (prompt: string, base64Image?: string, modelName: string = 'gemini-2.5-flash'): Promise<string> => {
  try {
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
      return chatCompletionAtBase(base, key, modelName, prompt, base64Image);
    }

    if (getAiProvider() === 'openai-compatible') {
      return openAiChatCompletion(prompt, base64Image, modelName);
    }

    const parts: any[] = [];

    // 如果有图片，添加图片部分
    if (base64Image) {
      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: 'image/jpeg',
        },
      });
    }

    // 添加文本部分
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: resolveNativeGeminiChatModelId(modelName),
      contents: {
        parts: parts,
      },
      config: {
        responseModalities: [Modality.TEXT],
      },
    });

    // 提取文本响应
    const textParts = response.candidates?.[0]?.content?.parts?.filter(part => part.text) || [];
    const responseText = textParts.map(part => part.text).join('');

    if (!responseText) {
      throw new Error("模型未返回有效响应");
    }

    return responseText;
  } catch (error) {
    console.error("对话请求出错:", error);
    throw error;
  }
};

/** 供设置页等读取 OpenAI 兼容 Base URL（历史导入名兼容） */
export { getOpenAiBaseUrl as getOpenAICompatBaseUrlForSettings } from './aiSettings';

/** 画布「视频生成」节点：ToAPIs（grok-video-3 / sora-2-vvip，逻辑见 openaiCompatibleService） */
export async function generateCanvasVideoViaToApis(
  prompt: string,
  opts: {
    videoModel: 'grok-video-3' | 'sora-2-vvip';
    durationSeconds: number;
    aspectRatio: string;
    resolution: '480p' | '720p';
    referenceImagesBase64?: string[];
    signal?: AbortSignal;
  }
): Promise<string> {
  return toApisCanvasVideoGenerate({ prompt, ...opts });
}
