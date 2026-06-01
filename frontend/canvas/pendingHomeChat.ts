/** 首页 AI 对话创建项目后，进入画布时待发送的首条消息 */
export type PendingHomeChat = { nodeId: string; prompt: string };

export const pendingHomeChatRef: { current: PendingHomeChat | null } = { current: null };
