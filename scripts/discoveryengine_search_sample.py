#!/usr/bin/env python3
"""
Google Cloud Discovery Engine 搜索调用示例（赠金应用外部调用）。

使用前：
  1. pip install google-cloud-discoveryengine
  2. 设置服务账号 JSON（与 Vertex 可共用同一密钥文件）：
     set GOOGLE_APPLICATION_CREDENTIALS=D:\\path\\to\\service-account.json
  3. 运行：
     python scripts/discoveryengine_search_sample.py "您的测试问题"
     python scripts/discoveryengine_search_sample.py --location us-central1 "测试"
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from google.cloud import discoveryengine_v1beta as discoveryengine

# --- 按您的 GCP 控制台配置 ---
PROJECT_ID = "project-59d87bf6-dd18-4439-ab6"
# 应用在 global 或 us-central1，若 404 可切换尝试
DEFAULT_LOCATION = "global"
# Discovery Engine 应用 ID（原 YOUR_APP_ID）
APP_ID = "3286008697108561920"
SERVING_CONFIG_ID = "default_config"
DEFAULT_PAGE_SIZE = 5


def search_sample(
    project_id: str,
    location: str,
    engine_id: str,
    search_query: str,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> discoveryengine.SearchResponse:
    """执行 Discovery Engine 搜索，费用计入指定应用（赠金）。"""
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError(
            "未设置 GOOGLE_APPLICATION_CREDENTIALS。"
            "请先指向服务账号 JSON，例如：\n"
            '  set GOOGLE_APPLICATION_CREDENTIALS=D:\\path\\to\\key.json'
        )

    # 1. 初始化客户端（自动读取 JSON 密钥）
    client = discoveryengine.SearchServiceClient()

    # 2. 构建资源路径（决定费用扣在哪个应用上）
    serving_config = client.serving_config_path(
        project=project_id,
        location=location,
        data_store=engine_id,
        serving_config=SERVING_CONFIG_ID,
    )

    # 3. 配置搜索请求
    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=search_query,
        page_size=page_size,
    )

    # 4. 执行调用
    return client.search(request)


def print_results(response: discoveryengine.SearchResponse) -> None:
    print("--- 搜索结果 ---")
    if not response.results:
        print("(无结果)")
        return
    for i, result in enumerate(response.results, start=1):
        print(f"\n[{i}]")
        data = result.document.derived_struct_data
        if data:
            # derived_struct_data 为 protobuf Struct，转成可读 JSON
            print(json.dumps(dict(data), ensure_ascii=False, indent=2))
        else:
            print(result)


def main() -> int:
    parser = argparse.ArgumentParser(description="Discovery Engine 搜索测试")
    parser.add_argument("query", nargs="?", default="您的测试问题", help="搜索问题")
    parser.add_argument(
        "--location",
        default=DEFAULT_LOCATION,
        help=f"区域，默认 {DEFAULT_LOCATION}（也可试 us-central1）",
    )
    parser.add_argument(
        "--project",
        default=PROJECT_ID,
        help=f"GCP 项目 ID，默认 {PROJECT_ID}",
    )
    parser.add_argument(
        "--app-id",
        default=APP_ID,
        help=f"Discovery Engine 应用 ID，默认 {APP_ID}",
    )
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    args = parser.parse_args()

    try:
        response = search_sample(
            project_id=args.project,
            location=args.location,
            engine_id=args.app_id,
            search_query=args.query,
            page_size=args.page_size,
        )
        print_results(response)
        print(f"\n共 {len(response.results)} 条结果")
        return 0
    except Exception as exc:
        print(f"调用失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
