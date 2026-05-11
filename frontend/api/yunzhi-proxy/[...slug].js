/**
 * 云智同源代理：单函数捕获 /api/yunzhi-proxy/*（含 v1/uploads/images、generated/…、chat/completions 等），
 * 避免 Vercel 在非 Next 项目中对深层嵌套 api 路径匹配异常导致 404。
 */
export { default, config } from '../_lib/yunzhi-proxy-handler.js';
