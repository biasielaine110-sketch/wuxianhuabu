import type { RefObject, MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { CanvasNode, ChatMessage, ChatNode, Edge } from '../types';
import { defaultCanvasImageModel } from './canvasModelUtils';
import { upscaleImage } from './canvasImageUpscale';
import { nextChatMessageId as nextMsgId } from './chatMessageIds';
import {
  isJimengImageModel,
  isJimengVideoModel,
  isVeo31FastVideoModel,
  videoNodeModelToToApis,
} from './videoModelUtils';
import { DEFAULT_DEEPSEEK_CHAT_MODEL_ID, normalizeDeepSeekChatModelId, getCodesonlineSavedKey, getHfsySavedKey, getJunlanSavedKey, getOpenAiSavedKey } from '../services/aiSettings';
import { normalizeCanvasGenerationImages } from '../services/openaiCompatibleService';
import { hasCanvasImagePayload } from '../services/canvasAssetResolver';
import {
  callGeminiChatWithHistory,
  editExistingImage,
  generateCanvasVideoViaToApis,
  generateNewImage,
} from '../services/geminiService';
import {
  buildIncomingRefSlots,
  parseRefPickIndices,
  parseMsgPickIndices,
  stripRefMarkers,
  resolveSlotImagesForIndices,
  resolveSlotAudios,
} from '../referenceSlots';
import {
  buildOriginalAspectPromptSuffix,
  isOriginalAspectRatio,
  loadImageDimensionsFromBase64,
  resolveI2iGenerationAspect,
} from './i2iAspectRatio';
import { useCanvasStore } from '../stores/canvasStore';

export type UseCanvasGenerationOptions = {
  setNodes: (updater: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  nodesRef: RefObject<CanvasNode[]>;
  edgesRef: RefObject<Edge[]>;
  promptPresets: Record<string, string>;
  ensureJimengReady: () => Promise<void>;
  openLoginRef: MutableRefObject<(() => void) | undefined>;
  handleUpdateNode: (id: string, updates: Partial<CanvasNode>) => void;
  appendNodesWithUndo: (
    newNodes: CanvasNode[],
    opts?: { edges?: Edge[]; selectIds?: string[] }
  ) => void;
  setEditingTextNodeIds: Dispatch<SetStateAction<Set<string>>>;
};

export type CanvasGenerationApi = {
  handleGenerate: (nodeId: string) => Promise<void>;
  handleGenerateVideo: (nodeId: string) => Promise<void>;
  handleSendMessage: (nodeId: string, opts?: { baseMessages?: import('../types').ChatMessage[]; promptText?: string }) => Promise<void>;
  handleOptimizePrompt: (nodeId: string, text: string) => Promise<void>;
  handleCancelGeneration: (nodeId: string) => void;
};

export function createCanvasGenerationApi(
  getDeps: () => UseCanvasGenerationOptions,
  generationAbortControllersRef: MutableRefObject<Map<string, AbortController>>,
  generationStartedAtRef: MutableRefObject<Map<string, number>>,
): CanvasGenerationApi {
  const imageModelBearerToken = (model: string): string | undefined => {
    const m = (model || '').trim();
    if (m === 'gpt-image-2-codesonline') return getCodesonlineSavedKey() || undefined;
    if (m === 'gpt-image-2-junlan') return getJunlanSavedKey() || undefined;
    if (m === 'gpt-image-2-hfsy' || m === 'nano-banana-2-hfsy' || m === 'nano-banana-pro-hfsy') return getHfsySavedKey() || undefined;
    if (m.startsWith('gpt-image-')) return getOpenAiSavedKey() || undefined;
    return undefined;
  };

  const handleCancelGeneration = (nodeId: string) => {
    const { setNodes } = getDeps();
    generationAbortControllersRef.current.get(nodeId)?.abort();
    generationAbortControllersRef.current.delete(nodeId);
    generationStartedAtRef.current.delete(nodeId);
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
    );
  };

  const handleGenerate = async (nodeId: string) => {
    const {
      setNodes,
      nodesRef,
      edgesRef,
      promptPresets,
      ensureJimengReady,
      openLoginRef,
      handleUpdateNode,
      appendNodesWithUndo,
      setEditingTextNodeIds,
    } = getDeps();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || (node.type !== 't2i' && node.type !== 'i2i' && node.type !== 'panoramaT2i')) return;

    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);
    generationStartedAtRef.current.set(nodeId, Date.now());

    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, isGenerating: true, error: undefined } : n));

    try {
      // ---- 即梦生图分支 ----
      const imageModel = node.model || defaultCanvasImageModel();
      if (isJimengImageModel(imageModel)) {
        const isI2i = node.type === 'i2i' || node.type === 'panoramaT2i';

        // 构建 prompt（即梦分支独立构建）
        const incomingEdges = edgesRef.current.filter(e => e.targetId === nodeId);
        const inputNodes = incomingEdges.map(e => nodesRef.current.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
        const textInputs = inputNodes.filter(n => n.type === 'text').map(n => n.prompt).filter(Boolean);
        const presetPrompts = (node.activePresets ?? []).map(key => promptPresets[key] || '').filter(Boolean);
        const combined = [...presetPrompts, node.prompt, ...textInputs].filter(Boolean).join('\n');
        const prompt = stripRefMarkers(combined) || combined;

        if (!prompt) throw new Error("请输入提示词或连接文本节点");

        await ensureJimengReady();
        const { generateJimengImage } = await import('../integrations/jimeng/jimengClient');

        // 图生图：取第一张参考图
        let imageUrl: string | undefined;
        let jimengI2iAspect = node.aspectRatio || '16:9';
        let jimengWidth: number | undefined;
        let jimengHeight: number | undefined;
        if (isI2i) {
          const slots = buildIncomingRefSlots(nodeId, edgesRef.current, nodesRef.current);
          const pickIndices = parseRefPickIndices(combined);
          const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);
          if (imageInputs.length > 0) imageUrl = imageInputs[0];
          const resolved = await resolveI2iGenerationAspect(
            node.aspectRatio,
            imageInputs[0],
            node.resolution
          );
          jimengI2iAspect = resolved.aspectRatio;
          if (isOriginalAspectRatio(node.aspectRatio) && imageInputs[0]) {
            if (resolved.sourceWidth && resolved.sourceHeight) {
              jimengWidth = resolved.sourceWidth;
              jimengHeight = resolved.sourceHeight;
            } else {
              const dims = await loadImageDimensionsFromBase64(imageInputs[0]);
              jimengWidth = dims.width;
              jimengHeight = dims.height;
            }
          }
        }

        const result = await generateJimengImage({
          prompt,
          model: imageModel,
          imageUrl,
          ratio: jimengI2iAspect,
          width: jimengWidth,
          height: jimengHeight,
          resolution: node.resolution || '4k',
          nodeId,
        });

        // 处理多张图片生成
        if (result.imageUrls && result.imageUrls.length > 0) {
          const prevImages = node.images || [];
          const newImages = [...prevImages, ...result.imageUrls];
          setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            isGenerating: false,
            images: newImages,
            currentImageIndex: prevImages.length,
          } : n));
        } else {
          const prevImages = node.images || [];
          const newImages = [...prevImages, result.imageUrl];
          setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            isGenerating: false,
            images: newImages,
            currentImageIndex: prevImages.length,
          } : n));
        }
        return;
      }

      const incomingEdges = edgesRef.current.filter(e => e.targetId === nodeId);
      const inputNodes = incomingEdges.map(e => nodesRef.current.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];

      const textInputs = inputNodes.filter(n => n.type === 'text').map(n => n.prompt).filter(Boolean);

      // 获取预设提示词（如果有激活的预设）
      const presetPrompts = (node.activePresets ?? []).map(key => promptPresets[key] || '').filter(Boolean);
      
      // 预设提示词在前，用户输入在后
      const combinedPrompt = [...presetPrompts, node.prompt, ...textInputs].filter(Boolean).join('\n');
      
      // Do NOT append resolution/aspect ratio to the prompt text to avoid confusing the model's style adherence.
      const finalPrompt2 = combinedPrompt;

      let base64DataArray: string[] = [];

      if (node.type === 't2i') {
        if (!finalPrompt2) throw new Error("请输入提示词或连接文本节点");
        base64DataArray = await generateNewImage(
          finalPrompt2,
          node.aspectRatio || '16:9',
          node.imageCount || 1,
          node.model || defaultCanvasImageModel(),
          node.resolution,
          node.quality,
          ac.signal
        );
      } else if (node.type === 'i2i' || node.type === 'panoramaT2i') {
        const slots = buildIncomingRefSlots(nodeId, edgesRef.current, nodesRef.current);
        const pickIndices = parseRefPickIndices(finalPrompt2);
        const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);
        const promptForModel = stripRefMarkers(finalPrompt2) || finalPrompt2;
        if (imageInputs.length === 0) throw new Error("请连接参考图片或视频节点，或使用 @R 引用有效参考槽位");
        if (!promptForModel) throw new Error("请输入编辑指令或连接文本节点");
        let aspectRatio = node.aspectRatio || '2:1';
        let pixelSize: string | undefined;
        let promptForEdit = promptForModel;
        if (node.type === 'i2i') {
          const resolved = await resolveI2iGenerationAspect(
            node.aspectRatio,
            imageInputs[0],
            node.resolution
          );
          aspectRatio = resolved.aspectRatio;
          pixelSize = resolved.pixelSize;
          promptForEdit = promptForModel + buildOriginalAspectPromptSuffix(resolved);
        }
        base64DataArray = await editExistingImage(
          imageInputs,
          promptForEdit,
          node.imageCount || 1,
          node.model || defaultCanvasImageModel(),
          aspectRatio,
          node.resolution,
          node.quality,
          pixelSize,
          ac.signal
        );
      }

        // Upscale images if 2k or 4k is selected
      const normalizedImages = await normalizeCanvasGenerationImages(base64DataArray, {
        signal: ac.signal,
        bearerToken: imageModelBearerToken(imageModel),
      });
      const upscaledImages = await Promise.all(
        normalizedImages.map((img) => upscaleImage(img, node.resolution || '4k'))
      );

      const validImages = upscaledImages.filter((im) => im && hasCanvasImagePayload(im.trim()));
      if (validImages.length === 0) {
        throw new Error(
          '生图完成但未收到可用图片。codesonline 异步任务可能仍在处理，或图片链接下载失败；请检查 API Key 与网络后重试。'
        );
      }

        // Append new images to existing ones
        const newImages = [...(node.images || []), ...validImages];

        setNodes(prev => prev.map(n => n.id === nodeId ? {
          ...n,
          isGenerating: false,
          images: newImages,
          currentImageIndex: (node.images || []).length,
          _thumbTick: ((node as CanvasNode & { _thumbTick?: number })._thumbTick ?? 0) + 1,
        } : n));

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setNodes(prev =>
          prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
        );
      } else {
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId ? { ...n, isGenerating: false, error: err.message || '生成失败' } : n
          )
        );
      }
    } finally {
      generationAbortControllersRef.current.delete(nodeId);
      generationStartedAtRef.current.delete(nodeId);
    }
  };

  // 处理对话节点发送消息（支持多轮上下文；可选 baseMessages + prompt 用于「编辑历史后重发」）
  const handleSendMessage = async (
    nodeId: string,
    opts?: { baseMessages?: ChatMessage[]; promptText?: string }
  ) => {
    const {
      setNodes,
      nodesRef,
      edgesRef,
      promptPresets,
      ensureJimengReady,
      openLoginRef,
      handleUpdateNode,
      appendNodesWithUndo,
      setEditingTextNodeIds,
    } = getDeps();
    const node = nodesRef.current.find(n => n.id === nodeId) as (CanvasNode & ChatNode) | undefined;
    if (!node || node.type !== 'chat') return;

    const inputText = (opts?.promptText ?? node.prompt)?.trim();
    if (!inputText) return;

    // 设置取消控制器
    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);

    // 检测是否为生图模式（以 [生图] 开头）
    const isImageGenMode = inputText.startsWith('[生图]');
    const imageGenPrompt = isImageGenMode ? inputText.replace(/^\[生图\]\s*/, '').trim() : '';

    const incomingEdges = edgesRef.current.filter(e => e.targetId === nodeId);
    const inputNodes = incomingEdges.map(e => nodesRef.current.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
    const textInputs = inputNodes.filter(n => n.type === 'text').map(n => n.prompt).filter(Boolean);

    const slots = buildIncomingRefSlots(nodeId, edgesRef.current, nodesRef.current);
    const pickIndices = parseRefPickIndices(inputText);
    const msgPickIndices = parseMsgPickIndices(inputText);
    const { base64s: refImages, missing } = await resolveSlotImagesForIndices(slots, pickIndices);

    // 从历史消息中提取图片（@M 引用）
    const msgImages: string[] = [];
    const msgRefDescs: string[] = [];
    if (msgPickIndices && msgPickIndices.length > 0) {
      const allMsgImages: { index: number; images: string[] }[] = [];
      let assistantCount = 0;
      for (let i = 0; i < (node.messages || []).length; i++) {
        const msg = (node.messages || [])[i];
        if (msg.role === 'assistant' && (msg.images?.length || msg.image)) {
          assistantCount++;
          allMsgImages.push({ index: assistantCount, images: msg.images || (msg.image ? [msg.image] : []) });
        }
      }
      for (const idx of msgPickIndices) {
        const found = allMsgImages.find(m => m.index === idx);
        if (found) {
          msgImages.push(...found.images);
          msgRefDescs.push(`@M${idx}`);
        }
      }
    }

    const strippedQuestion = stripRefMarkers(inputText) || inputText;

    const baseMessages = opts?.baseMessages ?? (node.messages || []);

      const contextParts: string[] = [];
      if (refImages.length > 0) {
        contextParts.push(`用户通过参考区提供了 ${refImages.length} 张视觉参考（见附图，顺序与 @R 序号一致）。`);
      }
      if (msgImages.length > 0) {
        contextParts.push(`用户提供了 ${msgImages.length} 张历史消息图片参考（见附图，顺序与 @M 序号一致）：${msgRefDescs.join(', ')}。请根据这些图片理解用户所指的具体内容。`);
      }
      const fallbackVideos = slots.filter(
        (s) => s.kind === 'video' && s.videoUrl && missing.includes(s.n)
      );
      if (fallbackVideos.length > 0) {
        contextParts.push(
          '以下参考视频若模型无法解码为附图，请结合链接理解场景（外链可能受跨域限制）：\n' +
            fallbackVideos.map((s) => `@R${s.n} ${s.videoUrl}`).join('\n')
        );
      }
      if (textInputs.length > 0) {
        contextParts.push('相关背景信息：' + textInputs.join('\n'));
      }
      contextParts.push('用户问题：' + strippedQuestion);
      const fullPrompt = contextParts.join('\n\n');

    const historyForApi = baseMessages.filter(
      (m) =>
        (m.content && m.content.trim().length > 0) ||
        (m.role === 'user' && (m.image || (m.images?.length ?? 0) > 0))
    );

    generationStartedAtRef.current.set(nodeId, Date.now());

    // 构建用户消息对象（保留@R标记用于显示，同时附加引用的图片）
    const genImages = [...refImages, ...msgImages];
    const userMsg: ChatMessage = {
      id: nextMsgId('user'),
      role: 'user',
      content: inputText, // 显示原始输入，保留 @R 引用标记
      image: genImages.length === 1 ? genImages[0] : undefined,
      images: genImages.length > 1 ? genImages : undefined,
    };

    // 立即显示用户消息并设置加载状态
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const ch = n as ChatNode;
        const existingMsgs = (ch.messages || []) as ChatMessage[];
        const MAX_CHAT_MESSAGES = 50;
        const afterUser = [...existingMsgs, userMsg];
        const trimmedAfterUser = afterUser.length > MAX_CHAT_MESSAGES ? afterUser.slice(-MAX_CHAT_MESSAGES) : afterUser;
        return { ...ch, messages: trimmedAfterUser, isGenerating: true, error: undefined, prompt: '' } as CanvasNode;
      })
    );

    try {
      // 生图模式：直接调用图片生成服务
      if (isImageGenMode) {
        if (!imageGenPrompt) {
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId ? { ...n, isGenerating: false, error: '请在 [生图] 后填写要生成的图片描述' } : n
            )
          );
          generationStartedAtRef.current.delete(nodeId);
          return;
        }
        const imageModel = (node as ChatNode).imageModel || 'gpt-image-2-codesonline';
        const aspectRatio = (node as ChatNode).imageAspectRatio || '16:9';
        const resolution = (node as ChatNode).imageResolution || '2k';
        const imageQuality = (node as ChatNode).imageQuality || 'low';
        const imageCount = 1;

        // 构建带上下文的生图提示词（传递最近10轮对话摘要，最多2000字符）
        const allCurrentMessages = (node.messages || []) as ChatMessage[];
        const recentMessages = allCurrentMessages.slice(-20); // 最近20条消息（约10轮对话）
        let contextSummary = '';
        const MAX_CONTEXT_CHARS = 2000; // 限制上下文总字符数
        if (recentMessages.length > 0) {
          const userMsgs = recentMessages.filter(m => m.role === 'user').slice(-10);
          if (userMsgs.length > 0) {
            // 限制每个用户消息的显示长度
            const truncatedMsgs = userMsgs.map(m => {
              const content = typeof m.content === 'string' ? m.content : String(m.content);
              return content.length > 300 ? content.slice(0, 300) + '...' : content;
            });
            contextSummary = `【对话上下文参考】最近对话：${truncatedMsgs.join(' → ')}`;
            // 如果超出限制，截断
            if (contextSummary.length > MAX_CONTEXT_CHARS) {
              contextSummary = contextSummary.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
            }
          }
        }
        const fullImagePrompt = contextSummary ? `${contextSummary}\n\n【本次生图要求】${imageGenPrompt}` : imageGenPrompt;

        let generatedImages: string[];
        if (genImages.length > 0) {
          // 有参考图时，使用图生图（editExistingImage）而非纯文生图
          generatedImages = await editExistingImage(
            genImages,
            fullImagePrompt,
            imageCount,
            imageModel,
            aspectRatio,
            resolution,
            imageQuality,
          );
        } else {
          // 无参考图时，使用纯文生图
          generatedImages = await generateNewImage(
            fullImagePrompt,
            aspectRatio,
            imageCount,
            imageModel,
            resolution,
            imageQuality
          );
        }

        generatedImages = await normalizeCanvasGenerationImages(generatedImages, {
          signal: ac.signal,
          bearerToken: imageModelBearerToken(imageModel),
        });

        const assistantMessage: ChatMessage = {
          id: nextMsgId('assistant'),
          role: 'assistant',
          content: `已根据您的描述生成 ${generatedImages.length} 张图片：`,
          images: generatedImages,
        };

        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== nodeId) return n;
            const ch = n as ChatNode;
            const existingMsgs = (ch.messages || []) as ChatMessage[];
            const MAX_CHAT_MESSAGES = 50;
            const trimmedAfterUser = existingMsgs.length > MAX_CHAT_MESSAGES ? existingMsgs.slice(-MAX_CHAT_MESSAGES) : existingMsgs;
            return { ...ch, messages: [...trimmedAfterUser, assistantMessage], isGenerating: false, prompt: '' } as CanvasNode;
          })
        );
        generationStartedAtRef.current.delete(nodeId);
        return;
      }

      // 普通对话模式
      const apiTurns = [
        ...historyForApi.map((m) => {
          const imgs = m.role === 'user' && m.images?.length ? m.images : undefined;
          const single =
            m.role === 'user' && !imgs?.length && m.image ? m.image : undefined;
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
            imageBase64: imgs && imgs.length === 1 ? imgs[0] : single,
            imageBase64s: imgs && imgs.length > 1 ? imgs : undefined,
          };
        }),
        {
          role: 'user' as const,
          content: fullPrompt,
          imageBase64: ([...refImages, ...msgImages].length) === 1 ? [...refImages, ...msgImages][0] : undefined,
          imageBase64s: ([...refImages, ...msgImages].length) > 1 ? [...refImages, ...msgImages] : undefined,
        },
      ];

      const chatModel = normalizeDeepSeekChatModelId(node.model || DEFAULT_DEEPSEEK_CHAT_MODEL_ID).trim();
      const response = await callGeminiChatWithHistory(apiTurns, chatModel);

      const assistantMessage: ChatMessage = {
        id: nextMsgId('assistant'),
        role: 'assistant',
        content: response.text,
        ...(response.images?.length ? { images: response.images } : {}),
      };

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const ch = n as ChatNode;
          const MAX_CHAT_MESSAGES = 50;
          const existingMsgs = (ch.messages || []) as ChatMessage[];
          const trimmedMsgs = existingMsgs.length > MAX_CHAT_MESSAGES ? existingMsgs.slice(-MAX_CHAT_MESSAGES) : existingMsgs;
          return { ...ch, messages: [...trimmedMsgs, assistantMessage], isGenerating: false, prompt: '' } as CanvasNode;
        })
      );
      generationStartedAtRef.current.delete(nodeId);
    } catch (err: any) {
      generationStartedAtRef.current.delete(nodeId);
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? ({
        ...n,
        isGenerating: false,
                error: err.message || '生成失败',
              } as CanvasNode)
            : n
        )
      );
    }
  };

  // 优化提示词：优先使用 gpt-5.5（君澜），失败则使用 deepseek-v4-flash
  const handleOptimizePrompt = async (nodeId: string, text: string) => {
    const {
      setNodes,
      nodesRef,
      edgesRef,
      promptPresets,
      ensureJimengReady,
      openLoginRef,
      handleUpdateNode,
      appendNodesWithUndo,
      setEditingTextNodeIds,
    } = getDeps();
    const sourceNode = nodesRef.current.find(n => n.id === nodeId);
    if (!sourceNode) return;

    // 设置源节点为生成状态（用于显示加载动画）
    generationStartedAtRef.current.set(nodeId, Date.now());
    handleUpdateNode(nodeId, { isGenerating: true, error: undefined });

    try {
      const apiTurns = [
        {
          role: 'user' as const,
          content: `请将以下文字内容优化成在 seedance 2.0 中进行生图和生视频的提示词。只输出优化后的提示词内容，不要解释。

原文内容：
${text}`,
        },
      ];

      let result = '';
      let usedFallback = false;

      try {
        result = (await callGeminiChatWithHistory(apiTurns, 'gpt-5.5-junlan')).text;
      } catch (err: any) {
        // GPT-5.5 失败，尝试 deepseek-v4-flash
        usedFallback = true;
        try {
          result = (await callGeminiChatWithHistory(apiTurns, 'deepseek-v4-flash')).text;
        } catch {
          handleUpdateNode(nodeId, { isGenerating: false, error: '优化提示词失败，请检查 API 配置' });
          return;
        }
      }

      if (!result.trim()) {
        handleUpdateNode(nodeId, { isGenerating: false, error: '未获取到优化后的提示词' });
        return;
      }

      // 在当前文本节点右侧创建新的文本节点，填入优化后的提示词
      const newId = `text-${Date.now()}`;
      // 新节点尺寸与源文本节点保持一致（用户调整过尺寸也能跟随）
      const newSize = {
        width: sourceNode?.width ?? 1000,
        height: sourceNode?.height ?? 2000,
      };
      const newNode: CanvasNode = {
        id: newId,
        type: 'text',
        x: (sourceNode?.x || 0) + newSize.width + 50,
        y: sourceNode?.y || 0,
        width: newSize.width,
        height: newSize.height,
        prompt: result.trim(),
        images: [],
        aspectRatio: '1:1',
        resolution: '2k',
        imageCount: 1,
        model: defaultCanvasImageModel(),
        viewMode: 'single',
        currentImageIndex: 0,
      };

      // 结束源节点生成状态
      handleUpdateNode(nodeId, { isGenerating: false });

      appendNodesWithUndo([newNode], { selectIds: [newId] });

      // 自动选中新节点进入编辑状态
      setTimeout(() => {
        setEditingTextNodeIds((prev) => {
          const next = new Set(prev);
          next.add(newId);
          return next;
        });
      }, 50);
    } catch (err: any) {
      handleUpdateNode(nodeId, { isGenerating: false, error: err.message || '优化失败' });
    }
  };

  /** 轮询即梦任务直到完成 */
  const pollJimengTask = async (nodeId: string, submitId: string, setNodesFn: any, edgesList: Edge[], nodesList: CanvasNode[]) => {
    const maxAttempts = 2160; // 最长轮询 3 小时（5 秒一次）
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const { queryJimengTask } = await import('../integrations/jimeng/jimengClient');
        const res = await queryJimengTask(submitId);
        if (res.ok && res.data) {
          const data = res.data;
          const genStatus = data.gen_status || data.status || "";
          if (genStatus === "completed" || genStatus === "done") {
            // 任务完成，获取视频 URL
            const videoUrl = data.video_url || data.url || "";
            if (videoUrl) {
              setNodesFn((prev: CanvasNode[]) => prev.map(n =>
                n.id === nodeId
                  ? {
                      ...n,
                      isGenerating: false,
                      videos: [...(n.videos || []), videoUrl],
                      currentVideoIndex: (n.videos || []).length,
                    }
                  : n
              ));
              return;
            }
          }
          if (genStatus === "fail") {
            setNodesFn((prev: CanvasNode[]) => prev.map(n =>
              n.id === nodeId ? { ...n, isGenerating: false, error: `[即梦] ${data.fail_reason || "生成失败"}` } : n
            ));
            return;
          }
          // querying / pending / running — 继续等待
          const queueInfo = data.queue_info || {};
          const pos = queueInfo.queue_idx ?? "?";
          const total = queueInfo.queue_length ?? "?";
          setNodesFn((prev: CanvasNode[]) => prev.map(n =>
            n.id === nodeId ? { ...n, status: `队列 ${pos}/${total}` } : n
          ));
        }
      } catch (e) {
        console.warn("[jimeng] poll error:", e);
      }
    }
    // 超时
    setNodesFn((prev: CanvasNode[]) => prev.map(n =>
      n.id === nodeId ? { ...n, isGenerating: false, error: "[即梦] 生成超时，请稍后重试" } : n
    ));
  };

  const handleGenerateVideo = async (nodeId: string) => {
    const {
      setNodes,
      nodesRef,
      edgesRef,
      promptPresets,
      ensureJimengReady,
      openLoginRef,
      handleUpdateNode,
      appendNodesWithUndo,
      setEditingTextNodeIds,
    } = getDeps();
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || node.type !== 'video') return;

    // 日志：确认选择的模型值
    console.log('[jimeng] handleGenerateVideo node.model =', node.model);
    console.log('[jimeng] isJimengVideoModel(node.model) =', isJimengVideoModel(node.model));

    generationAbortControllersRef.current.get(nodeId)?.abort();
    const ac = new AbortController();
    generationAbortControllersRef.current.set(nodeId, ac);
    generationStartedAtRef.current.set(nodeId, Date.now());

    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: true, error: undefined } : n)));

    // ---- 提前判断是否为即梦模型 ----
    const isJimeng = isJimengVideoModel(node.model);

    if (isJimeng) {
      console.log('[jimeng] entering jimeng video generation');

      try {
        // 检查 prompt（即梦也需 prompt）
        const incomingEdges = edgesRef.current.filter(e => e.targetId === nodeId);
        const inputNodes = incomingEdges.map(e => nodesRef.current.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
        const textInputs = inputNodes.filter(n => n.type === 'text').map(n => n.prompt).filter(Boolean);

        const combinedRaw = [node.prompt, ...textInputs].filter(Boolean).join('\n').trim();
        if (!combinedRaw) throw new Error('请输入提示词');

        const slots = buildIncomingRefSlots(nodeId, edgesRef.current, nodesRef.current);
        const pickIndices = parseRefPickIndices(combinedRaw);
        const combinedPrompt = stripRefMarkers(combinedRaw) || combinedRaw;
        const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);

        // 即梦路径：先确保登录
        await ensureJimengReady();

        // 如果有参考图，取第一张作为 imageUrl
        let imageUrl: string | undefined;
        if (imageInputs.length > 0) {
          imageUrl = imageInputs[0];
        }

        const { generateJimengVideo } = await import('../integrations/jimeng/jimengClient');
        const result = await generateJimengVideo({
          prompt: combinedPrompt,
          model: node.model || 'jimeng-video-v3',
          imageUrl,
          images: imageInputs, // 传递所有参考图（用于全能参考、智能多帧等模式）
          videoMode: node.videoMode || 'image2video',
          duration: node.videoDuration || 8,
          ratio: node.aspectRatio || '16:9',
          nodeId,
        });

        // 如果返回了 submitId（任务在队列中），启动轮询
        if (!result.ok && (result as any).submitId) {
          const submitId = (result as any).submitId;
          setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: true, error: undefined, status: '队列中...' } : n)));
          await pollJimengTask(nodeId, submitId, setNodes, useCanvasStore.getState().edges, useCanvasStore.getState().nodes);
          return;
        }

        const prevVideos = node.videos || [];
        const newVideos = [...prevVideos, result.videoUrl];
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId
              ? {
                  ...n,
                  isGenerating: false,
                  videos: newVideos,
                  currentVideoIndex: prevVideos.length,
                  // 保存原始URL用于错误回退
                  originalVideoUrl: result.videoUrl.includes('localhost:3107') 
                    ? result.originalUrl || result.videoUrl 
                    : result.videoUrl,
                }
              : n
          )
        );
      } catch (err: unknown) {
        const aborted =
          (err as { name?: string })?.name === 'AbortError' ||
          (err instanceof DOMException && err.name === 'AbortError');
        if (aborted) {
          setNodes(prev =>
            prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
          );
        } else {
          const message = err instanceof Error ? err.message : '即梦视频生成失败';
          console.error('[jimeng] error:', message, 'node.model=', node.model);
          // 如果是登录过期，自动弹出登录对话框
          if ((err as any).loginRequired && typeof openLoginRef.current === 'function') {
            openLoginRef.current();
          }
          setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: `[即梦] ${message}` } : n)));
        }
      } finally {
        generationAbortControllersRef.current.delete(nodeId);
        generationStartedAtRef.current.delete(nodeId);
      }
      return; // 即梦分支处理完毕，直接返回
    }

    // ---- 非即梦模型，走原有 ToAPIs 逻辑 ----
    try {
      const incomingEdges = edgesRef.current.filter(e => e.targetId === nodeId);
      const inputNodes = incomingEdges.map(e => nodesRef.current.find(n => n.id === e.sourceId)).filter(Boolean) as CanvasNode[];
      const textInputs = inputNodes.filter(n => n.type === 'text').map(n => n.prompt).filter(Boolean);

      const combinedRaw = [node.prompt, ...textInputs].filter(Boolean).join('\n').trim();
      if (!combinedRaw) throw new Error('请输入提示词或连接文本节点');

      const slots = buildIncomingRefSlots(nodeId, edgesRef.current, nodesRef.current);
      const pickIndices = parseRefPickIndices(combinedRaw);
      const combinedPrompt = stripRefMarkers(combinedRaw) || combinedRaw;
      const { base64s: imageInputs } = await resolveSlotImagesForIndices(slots, pickIndices);

      // 解析语音参考
      const audioRefs = resolveSlotAudios(slots);
      const audioBase64 = audioRefs.length > 0 ? audioRefs[0].base64 : undefined;
      const referenceVideoUrls = slots
        .filter((slot) => slot.kind === 'video' && typeof slot.videoUrl === 'string')
        .map((slot) => slot.videoUrl as string)
        .filter((url) => /^https?:\/\//i.test(url.trim()))
        .slice(0, 3);

      const videoModel = videoNodeModelToToApis(node.model);

      // --- ToAPIs 路径（原有逻辑） ---
        let videoUrl: string;

        const resolution: '480p' | '720p' | '1080p' | '4k' =
          videoModel === 'veo3.1-fast'
            ? (['1080p', '4k'].includes(node.videoResolution || '') ? (node.videoResolution as '1080p' | '4k') : '1080p')
            : videoModel === 'sora-2-vvip'
              ? '720p'
              : videoModel === 'doubao-seedance-1-5-pro'
                ? (['480p', '1080p'].includes(node.videoResolution || '') ? (node.videoResolution as '480p' | '1080p') : '720p')
                : videoModel === 'seedance-2'
                  ? (node.videoResolution === '1080p' ? '1080p' : '720p')
                  : videoModel === 'seedance-2-fast'
                    ? '720p'
                    : videoModel === 'doubao-seedance-2-0-260128' || videoModel === 'doubao-seedance-2-0-fast-260128'
                      ? (['480p', '1080p'].includes(node.videoResolution || '') ? (node.videoResolution as '480p' | '1080p') : '720p')
                      : node.videoResolution === '480p'
                  ? '480p'
                  : '720p';

        videoUrl = await generateCanvasVideoViaToApis(combinedPrompt, {
          videoModel,
          durationSeconds:
            node.videoDuration ??
            (videoModel === 'sora-2-vvip' || videoModel === 'veo3.1-fast' ? 8 : 10),
          aspectRatio: node.aspectRatio || '16:9',
          resolution,
          referenceImagesBase64: (videoModel === 'doubao-seedance-1-5-pro' || videoModel === 'gemini-omni-flash' || videoModel === 'seedance-2' || videoModel === 'seedance-2-fast' || videoModel === 'doubao-seedance-2-0-260128' || videoModel === 'doubao-seedance-2-0-fast-260128') ? imageInputs.slice(0, 2) : imageInputs.slice(0, 3),
          referenceVideoUrls,
          referenceAudioBase64: audioBase64,
          signal: ac.signal,
        });

        const prevVideos = node.videos || [];
        const newVideos = [...prevVideos, videoUrl];
        setNodes(prev =>
          prev.map(n =>
            n.id === nodeId
              ? {
                  ...n,
                  isGenerating: false,
                  videos: newVideos,
                  currentVideoIndex: prevVideos.length,
                }
              : n
          )
        );
    } catch (err: unknown) {
      const aborted =
        (err as { name?: string })?.name === 'AbortError' ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (aborted) {
        setNodes(prev =>
          prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: undefined } : n))
        );
      } else {
        const message = err instanceof Error ? err.message : '生成失败';
        setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, isGenerating: false, error: message } : n)));
      }
    } finally {
      generationAbortControllersRef.current.delete(nodeId);
      generationStartedAtRef.current.delete(nodeId);
    }
  };



  return {
    handleGenerate,
    handleGenerateVideo,
    handleSendMessage,
    handleOptimizePrompt,
    handleCancelGeneration,
  };
}
