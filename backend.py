#!/usr/bin/env python3
"""yybb 后端 TTS 服务（可选）
使用 edge-tts 生成真实音频，解决浏览器语音合成忽略发音人选择的问题。
用法：
    python backend.py [--port 8778]
然后在 yybb 页面勾选"使用后端 TTS"即可。
"""
import argparse
import asyncio
import base64
import io
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

import edge_tts

# 中文音色映射（对应源站 7 种音色）
VOICE_MAP = {
    0: "zh-CN-XiaoxiaoNeural",  # 亲和女声
    1: "zh-CN-YunxiNeural",    # 亲和男声
    2: "zh-CN-YunyangNeural",  # 成熟男声
    3: "zh-CN-XiaoyiNeural",   # 活力男声
    4: "zh-CN-YunjianNeural",  # 温暖女声
    5: "zh-CN-YunxiaNeural",   # 情感女声
    6: "zh-CN-liaoning-XiaobeiNeural",  # 情感男声（方言）
}

VOICE_LABELS = [
    "亲和女声",
    "亲和男声",
    "成熟男声",
    "活力男声",
    "温暖女声",
    "情感女声",
    "情感男声（方言）",
]


class TTSHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # 简洁日志
        print(f"[TTS] {args[0]}")

    def do_POST(self):
        if self.path == "/api/tts" or self.path == "/tools/TextToVoice":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body)
                text = data.get("Text", data.get("text", ""))
                voice_type = int(data.get("VoiceType", data.get("voice", 0)))

                if not text:
                    self._respond(False, "文本为空")
                    return

                voice_name = VOICE_MAP.get(voice_type, VOICE_MAP[0])

                # 异步生成音频
                mp3_data = asyncio.run(self._generate_mp3(text, voice_name))
                if mp3_data is None:
                    self._respond(False, "生成音频失败")
                    return

                # 返回 base64
                b64 = base64.b64encode(mp3_data).decode("utf-8")
                self._respond(True, None, b64)
            except Exception as e:
                self._respond(False, str(e))
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/api/voices" or self.path == "/tools/voices":
            voices = [
                {"value": i, "label": label}
                for i, label in enumerate(VOICE_LABELS)
            ]
            self._json_response({"ISOK": True, "DATA": voices})
        else:
            self.send_response(404)
            self.end_headers()

    async def _generate_mp3(self, text: str, voice: str) -> bytes:
        communicate = edge_tts.Communicate(text, voice)
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                buffer.write(chunk["data"])
        return buffer.getvalue()

    def _respond(self, is_ok: bool, message: str = None, data: str = None):
        resp = {"ISOK": is_ok}
        if not is_ok:
            resp["MESSAGE"] = message or "未知错误"
        if data is not None:
            resp["DATA"] = data
        self._json_response(resp)

    def _json_response(self, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="yybb TTS 后端服务")
    parser.add_argument("--port", type=int, default=8778, help="监听端口（默认 8778）")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址（默认 127.0.0.1）")
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), TTSHandler)
    print(f"yybb TTS 后端已启动: http://{args.host}:{args.port}/")
    print(f"  - POST {args.host}:{args.port}/api/tts   → 生成音频")
    print(f"  - GET  {args.host}:{args.port}/api/voices → 获取音色列表")
    print(f"  在 yybb 页面勾选「使用后端 TTS」即可使用")
    print("按 Ctrl+C 停止服务")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
